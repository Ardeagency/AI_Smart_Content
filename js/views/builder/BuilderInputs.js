/**
 * BuilderInputs — Mixin for DevBuilderView
 * Handles: canvas rendering, drag & drop, field management, properties panel
 */
(function () {
  'use strict';
  const P = DevBuilderView.prototype;

  P.renderComponentsList = function () {
    const container = this.querySelector('#componentsList');
    if (!container) return;
    
    // Agrupar por categoría (taxonomía: basic, smart_text, semantic, brand, media, controls, structural)
    const groups = {
      basic: { name: 'Básicos', icon: 'shapes', items: [] },
      smart_text: { name: 'Texto / IA', icon: 'terminal', items: [] },
      semantic: { name: 'Semánticos', icon: 'microphone', items: [] },
      brand: { name: 'Marca y contexto', icon: 'storefront', items: [] },
      context: { name: 'Contexto', icon: 'database', items: [] },
      media: { name: 'Media', icon: 'image', items: [] },
      controls: { name: 'Controles', icon: 'sliders', items: [] },
      advanced: { name: 'Avanzados', icon: 'gear-six', items: [] },
      structural: { name: 'Estructura', icon: 'square', items: [] },
      ai: { name: 'IA', icon: 'magic-wand', items: [] }
    };
    this.componentTemplates.forEach(template => {
      const category = template.category || 'basic';
      if (groups[category]) {
        groups[category].items.push(template);
      } else {
        groups.basic.items.push(template);
      }
    });

    const escapeAttr = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const escapeHtml = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    
    let html = '';
    
    Object.entries(groups).forEach(([key, group]) => {
      if (group.items.length === 0) return;
      
      html += `
        <div class="component-group" data-group-key="${escapeAttr(key)}">
          <div class="component-group-header">
            <span>${escapeHtml(group.name)}</span>
          </div>
          <div class="component-group-items component-group-grid">
            ${group.items.map(template => {
              const searchText = [template.name, template.description].filter(Boolean).join(' ').toLowerCase();
              const iconName = template.icon_name || 'textbox';
              const templateJson = JSON.stringify(template.base_schema).replace(/'/g, '&#39;');
              return `
              <div class="component-item" 
                   draggable="true" 
                   data-template-id="${escapeAttr(template.id)}"
                   data-template="${escapeAttr(templateJson)}"
                   data-search="${escapeAttr(searchText)}">
                <i class="ph ph-${escapeHtml(iconName)}"></i>
                <span class="component-name">${escapeHtml(template.name)}</span>
                </div>
            `;
            }).join('')}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    this.setupComponentsSearch();
    this.setupDragAndDrop();
  };

  P.setupComponentsSearch = function () {
    const input = this.querySelector('#componentsSearchInput');
    const container = this.querySelector('#componentsList');
    if (!input || !container) return;

    const filter = () => {
      const q = (input.value || '').trim().toLowerCase();
      container.querySelectorAll('.component-group').forEach(groupEl => {
        const items = groupEl.querySelectorAll('.component-item');
        let visibleCount = 0;
        items.forEach(item => {
          const search = (item.getAttribute('data-search') || '').trim();
          const show = !q || search.includes(q);
          item.classList.toggle('component-item-hidden', !show);
          if (show) visibleCount++;
        });
        groupEl.classList.toggle('component-group-empty', visibleCount === 0);
      });
    };

    input.addEventListener('input', filter);
    input.addEventListener('change', filter);
  };

  P.setupDragAndDrop = function () {
    // Componentes arrastrables
    const components = this.querySelectorAll('.component-item');
    components.forEach(comp => {
      comp.addEventListener('dragstart', (e) => this.handleComponentDragStart(e));
      comp.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });
    
    // Canvas como drop zone
    const canvas = this.querySelector('#builderCanvas');
    if (canvas) {
      canvas.addEventListener('dragover', (e) => this.handleDragOver(e));
      canvas.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      canvas.addEventListener('drop', (e) => this.handleDrop(e));
    }
  };

  P.handleComponentDragStart = function (e) {
    const item = e.target.closest('.component-item');
    if (!item) return;
    const templateId = item.dataset.templateId;
    const templateData = item.dataset.template;
    if (!templateId || !templateData) return;
    
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'new_component',
      templateId,
      templateData: JSON.parse(templateData)
    }));
    
    item.classList.add('dragging');
    this.querySelector('#builderCanvas')?.classList.add('drag-active');
  };

  P.handleDragEnd = function (e) {
    const item = e.target.closest('.component-item');
    if (item) item.classList.remove('dragging');
    this.querySelector('#builderCanvas')?.classList.remove('drag-active', 'drag-over');
  };

  P.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.querySelector('#builderCanvas')?.classList.add('drag-over');
  };

  P.handleDragLeave = function (e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      this.querySelector('#builderCanvas')?.classList.remove('drag-over');
    }
  };

  P.handleDrop = function (e) {
    e.preventDefault();
    this.querySelector('#builderCanvas')?.classList.remove('drag-active', 'drag-over');
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (data.type === 'new_component') {
        this.addField(data.templateId, data.templateData);
      } else if (data.type === 'reorder') {
        // Reordenamiento de campos existentes
        this.reorderField(data.fromIndex, this.getDropIndex(e));
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  };

  P.addField = function (templateId, templateDataFromDrag) {
    const template = this.componentTemplates.find(t => String(t.id) === String(templateId));
    // Usar siempre el template actual (BD o fallback): base_schema y default_ui_config son la fuente de verdad
    const baseSchema = template?.base_schema && typeof template.base_schema === 'object'
      ? { ...template.base_schema }
      : (templateDataFromDrag && typeof templateDataFromDrag === 'object' ? { ...templateDataFromDrag } : {});
    const defaultUi = template?.default_ui_config && typeof template.default_ui_config === 'object' ? { ...template.default_ui_config } : {};
    const fieldName = this.generateFieldKey(template?.name || templateId);
    
    const newField = {
      key: fieldName,
      label: template?.name || 'Campo',
      required: Boolean(baseSchema.required),
      placeholder: baseSchema.placeholder ?? '',
      description: baseSchema.description ?? '',
      ...baseSchema,
      input_type: baseSchema.input_type || baseSchema.type || 'text',
      ui: {
        width: 'full',
        hidden: false,
        ...defaultUi,
        width: defaultUi.width != null ? defaultUi.width : 'full',
        hidden: defaultUi.hidden != null ? defaultUi.hidden : false
      }
    };
    
    this.inputSchema.push(newField);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.updateJsonPreview();
    
    this.selectField(this.inputSchema.length - 1);
  };

  P.generateFieldKey = function (baseName) {
    const base = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    let key = base;
    let counter = 1;
    
    while (this.inputSchema.some(f => f.key === key)) {
      key = `${base}_${counter}`;
      counter++;
    }
    
    return key;
  };

  P.reorderField = function (fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    
    const [field] = this.inputSchema.splice(fromIndex, 1);
    this.inputSchema.splice(toIndex, 0, field);
    
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    
    if (this.selectedFieldIndex === fromIndex) {
      this.selectedFieldIndex = toIndex;
    }
  };

  P.getDropIndex = function (e) {
    const fields = this.querySelectorAll('.canvas-field');
    let index = this.inputSchema.length;
    
    fields.forEach((field, i) => {
      const rect = field.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      if (e.clientY < midY && index === this.inputSchema.length) {
        index = i;
      }
    });
    
    return index;
  };

  P.renderCanvas = function () {
    const canvas = this.querySelector('#canvasFields');
    const emptyState = this.querySelector('#canvasEmptyState');
    
    if (!canvas) return;
    
    if (this.inputSchema.length === 0) {
      canvas.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    
    canvas.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    canvas.innerHTML = this.inputSchema.map((field, index) => this.renderCanvasField(field, index)).join('');
    this.enableCanvasPreviewInputs(canvas);
    this.setupCanvasFieldListeners();
  };

  /** Habilita interacción en los controles del canvas (escribir en string, elegir en dropdown, etc.) */
  P.enableCanvasPreviewInputs = function (container) {
    if (!container) return;
    container.querySelectorAll('.canvas-field-preview input, .canvas-field-preview select, .canvas-field-preview textarea').forEach(el => {
      el.removeAttribute('disabled');
      el.style.cursor = el.tagName === 'SELECT' ? 'pointer' : 'text';
    });
  };

  P.renderCanvasField = function (field, index) {
    const isSelected = this.selectedFieldIndex === index;
    const inputPreview = this.renderInputPreview(field);
    
    return `
      <div class="canvas-field ${isSelected ? 'selected' : ''}" 
           data-index="${index}"
           draggable="true">
        <button type="button" class="canvas-field-remove" title="Eliminar (Delete)" aria-label="Eliminar">
          <i class="ph ph-x"></i>
        </button>
        <div class="canvas-field-header">
          <div class="canvas-field-drag">
            <i class="ph ph-dots-six-vertical"></i>
          </div>
          <div class="canvas-field-info">
            <span class="field-label">${field.label || field.key}</span>
            <span class="field-type">${(field.input_type || field.type) === 'colores' ? `colores (máx. ${field.max_selections != null ? field.max_selections : 6})` : (field.input_type || field.type || 'text')}</span>
            ${field.required ? '<span class="field-required">*</span>' : ''}
          </div>
          <div class="canvas-field-actions">
            <button type="button" class="field-action-btn duplicate-field" title="Duplicar">
              <i class="ph ph-copy"></i>
            </button>
            <button type="button" class="field-action-btn delete-field" title="Eliminar">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </div>
        <div class="canvas-field-preview">
          ${inputPreview}
        </div>
      </div>
    `;
  };

  P.renderInputPreview = function (field) {
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.renderPreview) {
      return window.InputRegistry.renderPreview(field);
    }
    const type = (field.input_type || field.type || 'text').toLowerCase();
    if (type === 'dropdown' || type === 'select' || type === 'multi_select') {
      const opts = field.options || [];
      const ph = (field.placeholder || 'Seleccionar...').replace(/"/g, '&quot;');
      const options = opts.map(o => {
        const label = o && (o.label !== undefined ? o.label : o.value !== undefined ? o.value : o);
        return `<option>${(label != null ? String(label) : '').replace(/</g, '&lt;')}</option>`;
      }).join('');
      return `<div class="input-dropdown-wrap"><select class="preview-input input-dropdown-select" disabled><option value="">${ph}</option>${options}</select></div>`;
    }
    const placeholder = (field.placeholder || '').replace(/"/g, '&quot;');
    return `<input type="text" class="preview-input" placeholder="${placeholder}" disabled>`;
  };

  P.setupCanvasFieldListeners = function () {
    const fields = this.querySelectorAll('.canvas-field');
    
    fields.forEach((field, index) => {
      // Evitar que el clic en el preview (inputs/select) propague y quite foco; solo seleccionar si se clic en header
      const preview = field.querySelector('.canvas-field-preview');
      if (preview) {
        preview.addEventListener('click', (e) => e.stopPropagation());
      }
      // Click en el campo (header, bordes) para seleccionar
      field.addEventListener('click', (e) => {
        if (!e.target.closest('.field-action-btn') && !e.target.closest('.canvas-field-remove') && !e.target.closest('.canvas-field-preview')) {
          this.selectField(index);
        }
      });
      
      // Drag para reordenar
      field.addEventListener('dragstart', (e) => {
        this.draggedFieldIndex = index;
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'reorder',
          fromIndex: index
        }));
        field.classList.add('dragging');
      });
      
      field.addEventListener('dragend', () => {
        field.classList.remove('dragging');
        this.draggedFieldIndex = null;
      });
      
      field.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== index) {
          field.classList.add('drag-target');
        }
      });
      
      field.addEventListener('dragleave', () => {
        field.classList.remove('drag-target');
      });
      
      field.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        field.classList.remove('drag-target');
        
        if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== index) {
          this.reorderField(this.draggedFieldIndex, index);
        }
      });
      
      // Botones de acción (header y X esquina)
      const duplicateBtn = field.querySelector('.duplicate-field');
      const deleteBtn = field.querySelector('.delete-field');
      const removeXBtn = field.querySelector('.canvas-field-remove');
      
      if (duplicateBtn) {
        duplicateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.duplicateField(index);
        });
      }
      
      const doDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deleteField(index);
      };
      if (deleteBtn) deleteBtn.addEventListener('click', doDelete);
      if (removeXBtn) removeXBtn.addEventListener('click', doDelete);
      
      // Sincronizar cambios en el preview (slider, texto, dropdown, etc.) con el campo para que el valor "quede"
      const schemaField = this.inputSchema[index];
      if (schemaField && preview) {
        const sync = () => { this.onFieldChange(); if (this.selectedFieldIndex === index) this.renderPropertiesPanel(); };
        preview.querySelectorAll('input, select, textarea').forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const type = (el.type || '').toLowerCase();
          if (type === 'range') {
            el.addEventListener('input', () => {
              schemaField.defaultValue = parseFloat(el.value);
              const span = el.nextElementSibling || preview.querySelector('.range-value');
              if (span) span.textContent = el.value;
              sync();
            });
          } else if (type === 'number') {
            el.addEventListener('input', () => {
              const n = parseFloat(el.value);
              schemaField.defaultValue = isNaN(n) ? undefined : n;
              sync();
            });
          } else if (type === 'checkbox') {
            el.addEventListener('change', () => {
              schemaField.defaultValue = el.checked;
              sync();
            });
          } else if (tag === 'select') {
            el.addEventListener('change', () => {
              schemaField.defaultValue = el.value === '' ? undefined : el.value;
              sync();
            });
          } else {
            el.addEventListener('input', () => {
              schemaField.defaultValue = el.value;
              sync();
            });
          }
        });
      }
    });
  };

  P.selectField = function (index) {
    this.selectedFieldIndex = index;
    
    // Update visual selection
    this.querySelectorAll('.canvas-field').forEach((f, i) => {
      f.classList.toggle('selected', i === index);
    });
    
    this.renderPropertiesPanel();
  };

  P.duplicateField = function (index) {
    const original = this.inputSchema[index];
    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      key: this.generateFieldKey(original.key),
      label: `${original.label} (copia)`
    };
    
    this.inputSchema.splice(index + 1, 0, duplicate);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.selectField(index + 1);
    this.updateJsonPreview();
  };

  P.deleteField = function (index) {
    this.inputSchema.splice(index, 1);
    this.hasUnsavedChanges = true;
    
    if (this.selectedFieldIndex === index) {
      this.selectedFieldIndex = null;
      this.renderPropertiesPanel();
    } else if (this.selectedFieldIndex > index) {
      this.selectedFieldIndex--;
    }
    
    this.renderCanvas();
    this.updateJsonPreview();
  };

  P.isStructuralField = function (field) {
    const t = (field.input_type || field.type || field.container_type || '').toLowerCase();
    return ['section', 'divider', 'heading', 'description', 'description_block'].indexOf(t) >= 0;
  };

  P.renderStructuralPropertiesPanel = function (field, panel) {
    const t = (field.input_type || field.type || 'section').toLowerCase();
    const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    let content = `
      <div class="properties-form properties-form-structural">
        <div class="property-group">
          <h4>Identificación</h4>
          <div class="property-field">
            <label for="propKey">Key (referencia)</label>
            <input type="text" id="propKey" value="${esc(field.key)}" pattern="[a-z0-9_]*">
            <span class="field-help">Opcional. No se envía al backend.</span>
          </div>
        </div>`;
    if (t === 'section') {
      content += `
        <div class="property-group">
          <h4>Sección</h4>
          <div class="property-field">
            <label for="propStructuralTitle">Título</label>
            <input type="text" id="propStructuralTitle" value="${esc(field.title || field.label)}">
          </div>
          <div class="property-field">
            <label for="propStructuralDesc">Descripción (subtítulo)</label>
            <input type="text" id="propStructuralDesc" value="${esc(field.section_description)}">
          </div>
          <div class="property-toggle">
            <label><input type="checkbox" id="propStructuralCollapsible" ${field.collapsible ? 'checked' : ''}><span>Colapsable</span></label>
          </div>
        </div>`;
    } else if (t === 'divider') {
      content += `
        <div class="property-group">
          <h4>Divisor</h4>
          <div class="property-field">
            <label for="propStructuralSpacing">Espaciado</label>
            <select id="propStructuralSpacing">
              <option value="small" ${(field.spacing || 'medium') === 'small' ? 'selected' : ''}>Pequeño</option>
              <option value="medium" ${(field.spacing || 'medium') === 'medium' ? 'selected' : ''}>Medio</option>
              <option value="large" ${(field.spacing || '') === 'large' ? 'selected' : ''}>Grande</option>
            </select>
          </div>
        </div>`;
    } else if (t === 'heading') {
      content += `
        <div class="property-group">
          <h4>Título</h4>
          <div class="property-field">
            <label for="propStructuralText">Texto</label>
            <input type="text" id="propStructuralText" value="${esc(field.text || field.label)}">
          </div>
          <div class="property-field">
            <label for="propStructuralLevel">Nivel (1-6)</label>
            <select id="propStructuralLevel">
              ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${(field.level != null ? Number(field.level) : 2) === n ? 'selected' : ''}>H${n}</option>`).join('')}
            </select>
          </div>
          <div class="property-field">
            <label for="propStructuralAlignment">Alineación</label>
            <select id="propStructuralAlignment">
              <option value="left" ${(field.alignment || 'left') === 'left' ? 'selected' : ''}>Izquierda</option>
              <option value="center" ${field.alignment === 'center' ? 'selected' : ''}>Centro</option>
              <option value="right" ${field.alignment === 'right' ? 'selected' : ''}>Derecha</option>
            </select>
          </div>
        </div>`;
    } else if (t === 'description' || t === 'description_block') {
      content += `
        <div class="property-group">
          <h4>Texto informativo</h4>
          <div class="property-field">
            <label for="propStructuralText">Texto</label>
            <textarea id="propStructuralText" rows="3">${esc(field.text || field.label)}</textarea>
          </div>
          <div class="property-field">
            <label for="propStructuralAlignment">Alineación</label>
            <select id="propStructuralAlignment">
              <option value="left" ${(field.alignment || 'left') === 'left' ? 'selected' : ''}>Izquierda</option>
              <option value="center" ${field.alignment === 'center' ? 'selected' : ''}>Centro</option>
              <option value="right" ${field.alignment === 'right' ? 'selected' : ''}>Derecha</option>
            </select>
          </div>
        </div>`;
    }
    content += '</div>';
    panel.innerHTML = content;
    this.setupStructuralPropertiesListeners(field, t);
  };

  P.setupStructuralPropertiesListeners = function (field, structuralType) {
    const sync = () => {
      this.hasUnsavedChanges = true;
      this.renderCanvas();
      this.updateJsonPreview();
    };
    const keyEl = this.querySelector('#propKey');
    if (keyEl) keyEl.addEventListener('input', () => { field.key = keyEl.value.trim() || field.key; sync(); });
    if (structuralType === 'section') {
      const titleEl = this.querySelector('#propStructuralTitle');
      const descEl = this.querySelector('#propStructuralDesc');
      const collEl = this.querySelector('#propStructuralCollapsible');
      if (titleEl) titleEl.addEventListener('input', () => { field.title = titleEl.value; field.label = titleEl.value; sync(); });
      if (descEl) descEl.addEventListener('input', () => { field.section_description = descEl.value; sync(); });
      if (collEl) collEl.addEventListener('change', () => { field.collapsible = collEl.checked; sync(); });
    } else if (structuralType === 'divider') {
      const spacingEl = this.querySelector('#propStructuralSpacing');
      if (spacingEl) spacingEl.addEventListener('change', () => { field.spacing = spacingEl.value; sync(); });
    } else if (structuralType === 'heading') {
      const textEl = this.querySelector('#propStructuralText');
      const levelEl = this.querySelector('#propStructuralLevel');
      const alignEl = this.querySelector('#propStructuralAlignment');
      if (textEl) textEl.addEventListener('input', () => { field.text = textEl.value; field.label = textEl.value; sync(); });
      if (levelEl) levelEl.addEventListener('change', () => { field.level = Number(levelEl.value); sync(); });
      if (alignEl) alignEl.addEventListener('change', () => { field.alignment = alignEl.value; sync(); });
    } else if (structuralType === 'description' || structuralType === 'description_block') {
      const textEl = this.querySelector('#propStructuralText');
      const alignEl = this.querySelector('#propStructuralAlignment');
      if (textEl) textEl.addEventListener('input', () => { field.text = textEl.value; field.label = textEl.value; sync(); });
      if (alignEl) alignEl.addEventListener('change', () => { field.alignment = alignEl.value; sync(); });
    }
  };

  P.renderPropertiesPanel = function () {
    const panel = this.querySelector('#propertiesPanel');
    if (!panel) return;
    
    if (this.selectedFieldIndex === null || !this.inputSchema[this.selectedFieldIndex]) {
      panel.innerHTML = `
        <div class="properties-empty">
          <i class="ph ph-cursor-click"></i>
          <p>Selecciona un campo para editar sus propiedades</p>
        </div>
      `;
      return;
    }
    
    const field = this.inputSchema[this.selectedFieldIndex];
    if (this.isStructuralField(field)) {
      this.renderStructuralPropertiesPanel(field, panel);
      return;
    }
    const isColores = (field.input_type || field.type) === 'colores';
    const dataType = isColores ? 'array' : (field.data_type || this.inferDataType(field));
    const defaultValueBlock = this.renderDefaultValueBlock(field, dataType);
    
    panel.innerHTML = `
      <div class="properties-form">
        <div class="property-group">
          <h4>General</h4>
          
          <div class="property-field">
            <label for="propKey">Key</label>
            <input type="text" id="propKey" value="${field.key}" pattern="[a-z0-9_]+">
          </div>
          
          <div class="property-field">
            <label for="propLabel">Label</label>
            <input type="text" id="propLabel" value="${(field.label || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propInputType">Tipo de control</label>
            <select id="propInputType">
              <option value="text" ${(field.input_type || field.type || 'text') === 'text' ? 'selected' : ''}>Texto corto</option>
              <option value="textarea" ${(field.input_type || field.type) === 'textarea' ? 'selected' : ''}>Texto largo</option>
              <option value="dropdown" ${(field.input_type || field.type) === 'dropdown' ? 'selected' : ''}>Dropdown</option>
              <option value="select" ${(field.input_type || field.type) === 'select' ? 'selected' : ''}>Selector (select)</option>
              <option value="number" ${(field.input_type || field.type) === 'number' ? 'selected' : ''}>Número</option>
              <option value="checkbox" ${(field.input_type || field.type) === 'checkbox' ? 'selected' : ''}>Checkbox</option>
              <option value="radio" ${(field.input_type || field.type) === 'radio' ? 'selected' : ''}>Radio</option>
              <option value="range" ${(field.input_type || field.type) === 'range' ? 'selected' : ''}>Slider</option>
              <option value="flags" ${(field.input_type || field.type) === 'flags' ? 'selected' : ''}>Flags (idioma, país, etnia)</option>
              <option value="colores" ${(field.input_type || field.type) === 'colores' ? 'selected' : ''}>Colores (círculos, máx. 6)</option>
              <option value="aspect_ratio" ${(field.input_type || field.type) === 'aspect_ratio' ? 'selected' : ''}>Aspect ratio (formato producción)</option>
              <option value="image_selector" ${(field.input_type || field.type) === 'image_selector' ? 'selected' : ''}>Selector de imagen (carrusel)</option>
            </select>
            <span class="field-help">Define si el campo es texto, dropdown, número, etc. Cambia el aspecto en el canvas y las opciones de abajo.</span>
          </div>
          
          <div class="property-field">
            <label for="propPlaceholder">Placeholder</label>
            <input type="text" id="propPlaceholder" value="${(field.placeholder || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propDescription">Texto de ayuda</label>
            <input type="text" id="propDescription" value="${(field.description || '').replace(/"/g, '&quot;')}">
          </div>
          
          <div class="property-field">
            <label for="propDataType">Tipo de dato</label>
            <select id="propDataType" ${isColores ? 'disabled' : ''}>
              <option value="string" ${dataType === 'string' ? 'selected' : ''}>String</option>
              <option value="number" ${dataType === 'number' ? 'selected' : ''}>Number</option>
              <option value="boolean" ${dataType === 'boolean' ? 'selected' : ''}>Boolean</option>
              <option value="array" ${dataType === 'array' ? 'selected' : ''}>Array</option>
              <option value="object" ${dataType === 'object' ? 'selected' : ''}>Object (JSON)</option>
            </select>
            ${isColores ? '<span class="field-help">Colores siempre es array (lista de hex).</span>' : ''}
          </div>
          
          ${defaultValueBlock}
          
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propRequired" ${field.required ? 'checked' : ''}>
              <span>Campo requerido</span>
            </label>
          </div>
        </div>
        
        ${this.renderTypeSpecificProperties(field)}
        
        <div class="property-group">
          <h4>Apariencia</h4>
          
          <div class="property-field">
            <label for="propWidth">Ancho</label>
            <select id="propWidth">
              <option value="full" ${(field.ui?.width || 'full') === 'full' ? 'selected' : ''}>Completo</option>
              <option value="half" ${field.ui?.width === 'half' ? 'selected' : ''}>Mitad</option>
              <option value="third" ${field.ui?.width === 'third' ? 'selected' : ''}>Tercio</option>
            </select>
          </div>
          
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propHidden" ${field.ui?.hidden ? 'checked' : ''}>
              <span>Oculto por defecto</span>
            </label>
          </div>
        </div>
        
      </div>
    `;
    
    this.setupPropertiesListeners();
    this.syncDefaultValueAndExtraConfigToDom(field, dataType);
    if (window.InputRegistry && window.InputRegistry.initColorsPicker) window.InputRegistry.initColorsPicker(panel);
    if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) window.InputRegistry.initAspectRatioPicker(panel);
  };

  P.inferDataType = function (field) {
    const t = (field.input_type || field.type || '').toLowerCase();
    if (['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(t) >= 0) return 'number';
    if (['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(t) >= 0) return 'boolean';
    if (['select', 'multi_select', 'tone_selector', 'mood_selector', 'length_selector', 'radio', 'aspect_ratio'].indexOf(t) >= 0) return 'string';
    if (['tag_input', 'gallery_picker', 'selection_checkboxes', 'colores'].indexOf(t) >= 0) return 'array';
    if (['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'image_selector'].indexOf(t) >= 0) return 'object';
    return field.data_type || 'string';
  };

  P.renderDefaultValueBlock = function (field, dataType) {
    const type = (field.input_type || field.type || '').toLowerCase();
    const isNumberFamily = ['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(type) >= 0;
    const isBooleanFamily = ['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(type) >= 0;
    const hasOptions = ['dropdown', 'select', 'radio', 'tone_selector', 'mood_selector', 'length_selector', 'aspect_ratio'].indexOf(type) >= 0;
    const opts = field.options || [];
    const escapeVal = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    const optVal = (o) => (o && (o.value !== undefined ? o.value : o.label !== undefined ? o.label : o));
    const optLabel = (o) => (o && (o.label !== undefined ? o.label : o.value !== undefined ? o.value : o));
    if (isNumberFamily) return '';
    if (isBooleanFamily) {
      const checked = field.defaultValue === true;
      return `
        <div class="property-field">
          <label>Valor por defecto</label>
          <div class="property-toggle">
            <label>
              <input type="checkbox" id="propDefaultValueBool" ${checked ? 'checked' : ''}>
              <span>Activado por defecto</span>
            </label>
          </div>
        </div>
      `;
    }
    if (hasOptions && opts.length > 0 && (dataType === 'string' || !dataType)) {
      const current = field.defaultValue != null ? String(field.defaultValue) : '';
      const optionsHtml = '<option value="">— Ninguno —</option>' + opts.map((o) => {
        const v = optVal(o) != null ? String(optVal(o)) : '';
        const lbl = optLabel(o) != null ? String(optLabel(o)) : v;
        return `<option value="${escapeVal(v)}" ${current === v ? 'selected' : ''}>${escapeVal(lbl)}</option>`;
      }).join('');
      return `
        <div class="property-field">
          <label for="propDefaultValueSelect">Valor por defecto</label>
          <select id="propDefaultValueSelect">${optionsHtml}</select>
        </div>
      `;
    }
    if (dataType === 'array') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (array)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='["item1", "item2"]'></textarea>
        </div>
      `;
    }
    if (dataType === 'object') {
      return `
        <div class="property-field">
          <label for="propDefaultValueJson">Valor por defecto (objeto)</label>
          <textarea id="propDefaultValueJson" class="property-json-editor" rows="3" placeholder='{ "id": "", "name": "" }'></textarea>
        </div>
      `;
    }
    const strVal = (typeof field.defaultValue === 'string') ? field.defaultValue : '';
    return `
      <div class="property-field">
        <label for="propDefaultValueStr">Valor por defecto</label>
        <input type="text" id="propDefaultValueStr" value="${escapeVal(strVal)}">
      </div>
    `;
  };

  P.syncDefaultValueAndExtraConfigToDom = function (field, dataType) {
    const type = (field.input_type || field.type || '').toLowerCase();
    const isArrayOrObject = dataType === 'array' || dataType === 'object';
    if (isArrayOrObject) {
      const jsonEl = this.querySelector('#propDefaultValueJson');
      if (jsonEl) {
        try {
          const val = field.defaultValue;
          jsonEl.value = (dataType === 'array' && Array.isArray(val)) || (dataType === 'object' && val && typeof val === 'object' && !Array.isArray(val))
            ? JSON.stringify(val, null, 2) : (dataType === 'array' ? '[]' : '{}');
        } catch (_) {
          jsonEl.value = dataType === 'array' ? '[]' : '{}';
        }
      }
    }
    const defaultValueSelectEl = this.querySelector('#propDefaultValueSelect');
    if (defaultValueSelectEl) {
      const v = field.defaultValue != null ? String(field.defaultValue) : '';
      defaultValueSelectEl.value = v;
    }
    const optionsArrayEl = this.querySelector('#propOptionsArray');
    if (optionsArrayEl && field.options) {
      optionsArrayEl.value = field.options.map(function (o) {
        if (o == null) return '';
        return (o.label !== undefined && o.label !== null ? o.label : (o.value !== undefined && o.value !== null ? o.value : o));
      }).join('\n');
    }
  };

  P.renderTypeSpecificProperties = function (field) {
    const type = (field.input_type || field.type || 'text').toLowerCase();
    let family = (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.getPropertyFamily)
      ? window.InputRegistry.getPropertyFamily(type) : type;
    if (type === 'dropdown' || type === 'select' || type === 'multi_select') family = 'select';
    const escapeProp = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    switch (family) {
      case 'text':
      case 'textarea': {
        const it = (field.input_type || field.type || 'text').toLowerCase();
        const isLong = it === 'textarea' || it === 'prompt_input' || it === 'prompt_system';
        const currentStringType = field.html_type === 'url' ? 'website' : (it === 'prompt_input' ? 'prompt' : (it === 'prompt_system' ? 'system_prompt' : (it === 'textarea' ? 'textarea' : 'text')));
        return `
          <div class="property-group">
            <h4>Texto / String</h4>
            <div class="property-field">
              <label for="propStringMode">Modo de texto</label>
              <select id="propStringMode">
                <option value="short" ${!isLong ? 'selected' : ''}>Texto corto</option>
                <option value="long" ${isLong ? 'selected' : ''}>Texto largo</option>
              </select>
            </div>
            <div class="property-field">
              <label for="propStringDataType">Tipo de texto</label>
              <select id="propStringDataType">
                <option value="text" ${currentStringType === 'text' ? 'selected' : ''}>Texto</option>
                <option value="textarea" ${currentStringType === 'textarea' ? 'selected' : ''}>Textarea</option>
                <option value="website" ${currentStringType === 'website' ? 'selected' : ''}>Website</option>
                <option value="prompt" ${currentStringType === 'prompt' ? 'selected' : ''}>Prompt</option>
                <option value="system_prompt" ${currentStringType === 'system_prompt' ? 'selected' : ''}>System prompt</option>
              </select>
              <span class="field-help">Website = URL; Prompt = entrada para IA; System prompt = prompt de sistema.</span>
            </div>
            <div class="property-field">
              <label for="propMaxLength">Límite de caracteres</label>
              <input type="number" id="propMaxLength" value="${field.maxLength != null ? field.maxLength : ''}" min="1" placeholder="Sin límite">
              <span class="field-help">Opcional. Dejar vacío para sin límite.</span>
            </div>
            ${isLong ? `
              <div class="property-field">
                <label for="propRows">Filas</label>
                <input type="number" id="propRows" value="${field.rows != null ? field.rows : 4}" min="2" max="20">
              </div>
            ` : ''}
          </div>
        `;
      }
      
      case 'number':
        return `
          <div class="property-group">
            <h4>Número</h4>
            <div class="property-row">
              <div class="property-field">
                <label for="propMin">Mínimo</label>
                <input type="number" id="propMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propMax">Máximo</label>
                <input type="number" id="propMax" value="${field.max ?? 100}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propStep">Incremento</label>
                <input type="number" id="propStep" value="${field.step ?? 1}" min="0.01">
              </div>
              <div class="property-field">
                <label for="propDefaultValue">Valor inicial</label>
                <input type="number" id="propDefaultValue" value="${field.defaultValue ?? ''}">
              </div>
            </div>
          </div>
        `;

      case 'stepper':
        return `
          <div class="property-group">
            <h4>Num Stepper</h4>
            <div class="property-row">
              <div class="property-field">
                <label for="propStepperMin">Mínimo</label>
                <input type="number" id="propStepperMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propStepperMax">Máximo</label>
                <input type="number" id="propStepperMax" value="${field.max ?? 999}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propStepperStep">Incremento</label>
                <input type="number" id="propStepperStep" value="${field.step ?? 1}" min="0.01">
              </div>
              <div class="property-field">
                <label for="propStepperDefault">Valor inicial</label>
                <input type="number" id="propStepperDefault" value="${field.defaultValue ?? 0}">
              </div>
            </div>
            <div class="property-field">
              <label for="propStepperUnit">Unidad (opcional)</label>
              <input type="text" id="propStepperUnit" value="${escapeProp(field.unit || '')}" placeholder="ej. px, %, kg">
              <span class="field-help">Sufijo mostrado junto al valor (px, %, etc.).</span>
            </div>
          </div>
        `;

      case 'checkbox':
        const checkboxChecked = field.defaultValue === true || field.defaultValue === 'true';
        return `
          <div class="property-group">
            <h4>Checkbox</h4>
            <div class="property-toggle">
              <label>
                <input type="checkbox" id="propCheckboxDefault" ${checkboxChecked ? 'checked' : ''}>
                <span>Marcado por defecto</span>
              </label>
            </div>
          </div>
        `;

      case 'switch':
        const switchChecked = field.defaultValue === true || field.defaultValue === 'true';
        return `
          <div class="property-group">
            <h4>Toggle / Switch</h4>
            <div class="property-toggle">
              <label>
                <input type="checkbox" id="propSwitchDefault" ${switchChecked ? 'checked' : ''}>
                <span>Activado por defecto (on)</span>
              </label>
            </div>
            <span class="field-help">Estado inicial del interruptor.</span>
          </div>
        `;

      case 'range': {
        const sliderMode = field.slider_mode || field.sliderMode || 'num';
        const isDouble = field.is_double_slider || field.isDoubleSlider || false;
        const valueStart = field.value_start ?? field.min ?? 0;
        const valueEnd = field.value_end ?? field.max ?? 100;
        return `
          <div class="property-group">
            <h4>Sliders</h4>
            <div class="property-field">
              <label for="propSliderMode">Tipo de valor</label>
              <select id="propSliderMode">
                <option value="num" ${sliderMode === 'num' ? 'selected' : ''}>Numérico</option>
                <option value="string" ${sliderMode === 'string' ? 'selected' : ''}>String (etiquetas por opción)</option>
              </select>
            </div>
            <div class="property-toggle" style="margin-bottom: 12px;">
              <label>
                <input type="checkbox" id="propDoubleSlider" ${isDouble ? 'checked' : ''}>
                <span>Double slider (rango entre dos valores)</span>
              </label>
            </div>
            ${sliderMode === 'num' ? `
            <div class="property-row">
              <div class="property-field">
                <label for="propSliderMin">Mínimo</label>
                <input type="number" id="propSliderMin" value="${field.min ?? 0}">
              </div>
              <div class="property-field">
                <label for="propSliderMax">Máximo</label>
                <input type="number" id="propSliderMax" value="${field.max ?? 100}">
              </div>
            </div>
            <div class="property-row">
              <div class="property-field">
                <label for="propSliderStep">Paso</label>
                <input type="number" id="propSliderStep" value="${field.step ?? 1}" min="0.01">
              </div>
              ${!isDouble ? `
              <div class="property-field">
                <label for="propSliderDefault">Valor por defecto</label>
                <input type="number" id="propSliderDefault" value="${field.defaultValue ?? 50}">
              </div>
              ` : `
              <div class="property-field">
                <label for="propSliderValueStart">Valor inicio (rango)</label>
                <input type="number" id="propSliderValueStart" value="${valueStart}">
              </div>
              <div class="property-field">
                <label for="propSliderValueEnd">Valor fin (rango)</label>
                <input type="number" id="propSliderValueEnd" value="${valueEnd}">
              </div>
              `}
            </div>
            ` : `
            <div class="property-field">
              <label>Opciones (slider string)</label>
            </div>
            <div class="options-editor options-editor--dropdown" id="optionsEditorSlider">
              ${(field.options || []).length === 0 ? `
                <div class="option-row" data-index="0">
                  <input type="text" class="option-single" placeholder="ej. Bajo" data-index="0">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              ` : (field.options || []).map((opt, i) => {
                const v = opt && (opt.value !== undefined ? opt.value : opt.label !== undefined ? opt.label : opt);
                const str = (v != null ? String(v) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="etiqueta" data-index="${i}" value="${escapeProp(str)}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtnSlider">
              <i class="ph ph-plus"></i> Opciones
            </button>
            `}
          </div>
        `;
      }
      
      case 'flags': {
        const flagCategory = field.flag_category || field.flags_category || 'language';
        return `
          <div class="property-group">
            <h4>Flags (dropdown con idioma / país / etnia)</h4>
            <div class="property-field">
              <label for="propFlagsCategory">Categoría</label>
              <select id="propFlagsCategory">
                <option value="language" ${flagCategory === 'language' ? 'selected' : ''}>Idioma</option>
                <option value="country" ${flagCategory === 'country' ? 'selected' : ''}>País / Región</option>
                <option value="ethnicity_region" ${flagCategory === 'ethnicity_region' ? 'selected' : ''}>Etnia / Origen</option>
              </select>
              <span class="field-help">Mismo contenedor que dropdown; opciones según categoría (vienen de FlagsData).</span>
            </div>
            <div class="property-toggle">
              <label>
                <input type="checkbox" id="propFlagsMultiple" ${field.is_multiple ? 'checked' : ''}>
                <span>Permitir varias selecciones</span>
              </label>
            </div>
          </div>
        `;
      }

      case 'colores': {
        const maxSel = field.max_selections != null ? field.max_selections : 6;
        const colorOpts = field.options || [{ value: '#000000', label: 'Negro' }, { value: '#ef4444', label: 'Rojo' }, { value: '#22c55e', label: 'Verde' }, { value: '#3b82f6', label: 'Azul' }];
        return `
          <div class="property-group">
            <h4>Colores (círculos seleccionables)</h4>
            <div class="property-field">
              <label for="propColoresMax">Máximo de colores seleccionables</label>
              <input type="number" id="propColoresMax" value="${maxSel}" min="1" max="12">
              <span class="field-help">Límite por defecto: 6 (como en brands son 4).</span>
            </div>
            <div class="property-field">
              <label>Paleta (hex + etiqueta)</label>
            </div>
            <div class="options-editor options-editor--colors" id="optionsEditorColores">
              ${colorOpts.map((opt, i) => {
                const v = (opt.value != null ? opt.value : opt).toString();
                const lbl = (opt.label != null ? opt.label : '').toString();
                return `
                <div class="option-row option-row--color" data-index="${i}">
                  <input type="text" class="option-color-hex" placeholder="#hex" value="${escapeProp(v)}" data-index="${i}" maxlength="7">
                  <input type="text" class="option-label" placeholder="Etiqueta" value="${escapeProp(lbl)}" data-index="${i}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>`;
              }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtnColores">
              <i class="ph ph-plus"></i> Añadir color
            </button>
          </div>
        `;
      }

      case 'aspect_ratio':
        return `
          <div class="property-group">
            <h4>Aspect ratio (formato de producción)</h4>
            <span class="field-help">Opciones fijas: 1:1, 2:3, 3:2, 4:3, 3:4, 4:5, 5:4, 16:9, 9:16, 21:9. Define el formato de la producción.</span>
          </div>
        `;

      case 'select':
      case 'radio': {
        const options = field.options || [];
        const it = (field.input_type || field.type || '').toLowerCase();
        const isSelect = it === 'select' || it === 'dropdown' || it === 'multi_select';
        const isDropdown = it === 'dropdown' || it === 'select';
        const isRadio = it === 'radio';
        const isSelectionCheckboxes = it === 'selection_checkboxes';
        const isFlags = it === 'flags';
        const isColores = it === 'colores';
        const isAspectRatio = it === 'aspect_ratio';
        const title = isAspectRatio ? 'Aspect ratio' : (isColores ? 'Colores' : (isFlags ? 'Flags' : (isSelectionCheckboxes ? 'Checkboxes (opciones)' : (isRadio ? 'Radio Buttons' : (isDropdown ? 'Dropdown' : 'Lista desplegable')))));
        const optVal = (o) => (o && (o.value !== undefined ? o.value : o.label !== undefined ? o.label : o));
        return `
          <div class="property-group">
            <h4>${title}</h4>
            ${isSelect ? `
            <div class="property-toggle" style="margin-bottom: 12px;">
              <label>
                <input type="checkbox" id="propMultiselect" ${field.is_multiple ? 'checked' : ''}>
                <span>Multiselección</span>
              </label>
            </div>
            ` : ''}
            <div class="property-field">
              <label>Opciones</label>
            </div>
            <div class="options-editor options-editor--dropdown" id="optionsEditor">
              ${options.length === 0 ? `
                <div class="option-row" data-index="0">
                  <input type="text" class="option-single" placeholder="ej. rubia" data-index="0">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              ` : options.map((opt, i) => {
                const str = escapeProp(optVal(opt) != null ? String(optVal(opt)) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="ej. rubia" data-index="${i}" value="${str}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="ph ph-x"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtn">
              <i class="ph ph-plus"></i> Opciones
            </button>
          </div>
        `;
      }
      
      default: {
        const contextSelectorTypes = ['brand_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'entity_selector'];
        const isContextSelector = contextSelectorTypes.indexOf(type) >= 0;
        const isMediaSelector = type === 'image_selector' || type === 'gallery_picker';
        let html = '';
        if (isContextSelector) {
          const currentContext = field.context_selector_type || type;
          html += `
            <div class="property-group">
              <h4>Selector de contexto</h4>
              <div class="property-field">
                <label for="propContextSelectorType">Qué selecciona</label>
                <select id="propContextSelectorType">
                  <option value="brand_selector" ${currentContext === 'brand_selector' ? 'selected' : ''}>Marca</option>
                  <option value="audience_selector" ${currentContext === 'audience_selector' ? 'selected' : ''}>Audiencia</option>
                  <option value="campaign_selector" ${currentContext === 'campaign_selector' ? 'selected' : ''}>Campaña</option>
                  <option value="product_selector" ${currentContext === 'product_selector' ? 'selected' : ''}>Producto</option>
                  <option value="entity_selector" ${currentContext === 'entity_selector' ? 'selected' : ''}>Entidad (producto/servicio/lugar)</option>
                </select>
              </div>
            </div>
          `;
        }
        if (type === 'entity_selector') {
          const entityTypes = field.entityTypes || ['product', 'service', 'place'];
          html += `
            <div class="property-group">
              <h4>Tipos de Entidad</h4>
              <div class="entity-types-toggles">
                <label class="property-toggle">
                  <input type="checkbox" data-type="product" ${entityTypes.includes('product') ? 'checked' : ''}>
                  <span>Productos</span>
                </label>
                <label class="property-toggle">
                  <input type="checkbox" data-type="service" ${entityTypes.includes('service') ? 'checked' : ''}>
                  <span>Servicios</span>
                </label>
                <label class="property-toggle">
                  <input type="checkbox" data-type="place" ${entityTypes.includes('place') ? 'checked' : ''}>
                  <span>Lugares</span>
                </label>
              </div>
            </div>
          `;
        }
        if (isMediaSelector) {
          const mediaSources = [
            { value: 'products', label: 'Productos' },
            { value: 'entities', label: 'Entidades (producto/servicio/lugar)' },
            { value: 'references', label: 'Referencias' },
            { value: 'visual_reference', label: 'Referencia visual' },
            { value: 'brand', label: 'Marca' },
            { value: 'audience', label: 'Audiencia' },
            { value: 'campaign', label: 'Campaña' },
            { value: 'other', label: 'Otro' }
          ];
          const currentMedia = field.media_source || field.function_type || 'other';
          const selectionMode = field.image_selection_mode || field.selection_mode || 'single';
          const inputDataMode = field.image_input_data === 'specific' ? 'specific' : 'all';
          const filterProducts = !!field.filter_products;
          const filterReferences = !!field.filter_references;
          const productFields = field.image_product_fields || ['id', 'name', 'main_image'];
          const productFieldOpts = [
            { value: 'id', label: 'ID' },
            { value: 'name', label: 'Nombre' },
            { value: 'main_image', label: 'Imagen principal' },
            { value: 'images', label: 'Imágenes' },
            { value: 'description', label: 'Descripción' },
            { value: 'price', label: 'Precio' },
            { value: 'category', label: 'Categoría' }
          ];
          html += `
            <div class="property-group">
              <h4>Selector de imagen / Carrusel</h4>
              <div class="property-field">
                <label for="propImageSelectionMode">Tipo de selección</label>
                <select id="propImageSelectionMode">
                  <option value="single" ${selectionMode === 'single' ? 'selected' : ''}>Única</option>
                  <option value="multiple" ${selectionMode === 'multiple' ? 'selected' : ''}>Múltiple</option>
                </select>
              </div>
              <div class="property-field">
                <label for="propMediaSource">Tipo de función</label>
                <select id="propMediaSource">
                  ${mediaSources.map(function (o) {
                    return '<option value="' + o.value + '"' + (currentMedia === o.value ? ' selected' : '') + '>' + escapeProp(o.label) + '</option>';
                  }).join('')}
                </select>
                <span class="field-help">Productos: imagen principal por producto. Referencias: todas las imágenes de referencia (con filtro de intención).</span>
              </div>
              <div class="property-field">
                <label for="propImageInputData">Input data</label>
                <select id="propImageInputData">
                  <option value="all" ${inputDataMode === 'all' ? 'selected' : ''}>Todos los datos del producto</option>
                  <option value="specific" ${inputDataMode === 'specific' ? 'selected' : ''}>Seleccionar datos específicos</option>
                </select>
              </div>
              <div class="property-field property-field--product-fields" id="propImageProductFieldsWrap" style="display: ${inputDataMode === 'specific' ? 'block' : 'none'};">
                <label>Datos del producto a incluir</label>
                <div class="property-toggles property-product-fields">
                  ${productFieldOpts.map(function (o) {
                    const checked = Array.isArray(productFields) && productFields.indexOf(o.value) >= 0;
                    return '<label class="property-toggle"><input type="checkbox" data-field="' + o.value + '"' + (checked ? ' checked' : '') + '><span>' + escapeProp(o.label) + '</span></label>';
                  }).join('')}
                </div>
              </div>
              <div class="property-field">
                <label>Activar filtro</label>
                <div class="property-toggles">
                  <label class="property-toggle">
                    <input type="checkbox" id="propFilterProducts" ${filterProducts ? 'checked' : ''}>
                    <span>Filtrar productos</span>
                  </label>
                  <label class="property-toggle">
                    <input type="checkbox" id="propFilterReferences" ${filterReferences ? 'checked' : ''}>
                    <span>Filtrar referencias</span>
                  </label>
                </div>
              </div>
            </div>
          `;
        }
        return html;
      }
    }
  };

  P.setupPropertiesListeners = function () {
    const field = this.inputSchema[this.selectedFieldIndex];
    if (!field) return;
    
    // General properties
    const keyInput = this.querySelector('#propKey');
    const labelInput = this.querySelector('#propLabel');
    const placeholderInput = this.querySelector('#propPlaceholder');
    const descriptionInput = this.querySelector('#propDescription');
    const requiredCheckbox = this.querySelector('#propRequired');
    const widthSelect = this.querySelector('#propWidth');
    const hiddenCheckbox = this.querySelector('#propHidden');
    
    if (keyInput) {
      keyInput.addEventListener('change', (e) => {
        const newKey = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (newKey && !this.inputSchema.some((f, i) => i !== this.selectedFieldIndex && f.key === newKey)) {
          field.key = newKey;
          this.onFieldChange();
        } else {
          e.target.value = field.key;
        }
      });
    }
    
    if (labelInput) {
      labelInput.addEventListener('input', (e) => {
        field.label = e.target.value;
        this.onFieldChange();
      });
    }
    
    const inputTypeSelect = this.querySelector('#propInputType');
    if (inputTypeSelect) {
      inputTypeSelect.addEventListener('change', (e) => {
        const newType = e.target.value;
        field.input_type = newType;
        field.type = newType;
        if (newType === 'dropdown' || newType === 'select') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
          }
        }
        if (newType === 'stepper_num' || newType === 'num_stepper') {
          if (field.min == null) field.min = 0;
          if (field.max == null) field.max = 999;
          if (field.step == null) field.step = 1;
          if (field.defaultValue == null) field.defaultValue = 0;
        }
        if (newType === 'selection_checkboxes') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: '1', label: 'Opción 1' }, { value: '2', label: 'Opción 2' }];
          }
          field.display_style = 'selection_checkboxes';
        }
        if (newType === 'range') {
          if (field.min == null) field.min = 0;
          if (field.max == null) field.max = 100;
          if (field.step == null) field.step = 1;
          if (field.defaultValue == null) field.defaultValue = 50;
        }
        if (newType === 'flags') {
          if (!field.flag_category) field.flag_category = 'language';
          if (!field.flags_category) field.flags_category = 'language';
        }
        if (newType === 'colores') {
          field.data_type = 'array';
          if (field.max_selections == null) field.max_selections = 6;
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: '#000000', label: 'Negro' }, { value: '#ef4444', label: 'Rojo' }, { value: '#22c55e', label: 'Verde' }, { value: '#3b82f6', label: 'Azul' }, { value: '#eab308', label: 'Amarillo' }, { value: '#8b5cf6', label: 'Violeta' }];
          }
        }
        if (newType === 'aspect_ratio') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            field.options = [{ value: '1:1', label: '1:1' }, { value: '2:3', label: '2:3' }, { value: '3:2', label: '3:2' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }, { value: '4:5', label: '4:5' }, { value: '5:4', label: '5:4' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '21:9', label: '21:9' }];
          }
          if (field.defaultValue == null) field.defaultValue = '1:1';
        }
        if (newType === 'toggle_switch' || newType === 'switch') {
          field.display_style = 'switch';
          if (field.defaultValue == null) field.defaultValue = false;
        }
        this.renderPropertiesPanel();
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    
    if (placeholderInput) {
      placeholderInput.addEventListener('input', (e) => {
        field.placeholder = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (descriptionInput) {
      descriptionInput.addEventListener('input', (e) => {
        field.description = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (requiredCheckbox) {
      requiredCheckbox.addEventListener('change', (e) => {
        field.required = e.target.checked;
        this.onFieldChange();
      });
    }
    
    if (widthSelect) {
      widthSelect.addEventListener('change', (e) => {
        if (!field.ui) field.ui = {};
        field.ui.width = e.target.value;
        this.onFieldChange();
      });
    }
    
    if (hiddenCheckbox) {
      hiddenCheckbox.addEventListener('change', (e) => {
        if (!field.ui) field.ui = {};
        field.ui.hidden = e.target.checked;
        this.onFieldChange();
      });
    }
    
    const dataTypeSelect = this.querySelector('#propDataType');
    if (dataTypeSelect) {
      dataTypeSelect.addEventListener('change', (e) => {
        field.data_type = e.target.value;
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    const defaultValueStr = this.querySelector('#propDefaultValueStr');
    if (defaultValueStr) {
      defaultValueStr.addEventListener('input', (e) => {
        field.defaultValue = e.target.value;
        this.onFieldChange();
      });
    }
    const defaultValueSelect = this.querySelector('#propDefaultValueSelect');
    if (defaultValueSelect) {
      defaultValueSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        field.defaultValue = v === '' ? undefined : v;
        this.onFieldChange();
      });
    }
    
    const defaultValueBool = this.querySelector('#propDefaultValueBool');
    if (defaultValueBool) {
      defaultValueBool.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    const defaultValueJson = this.querySelector('#propDefaultValueJson');
    if (defaultValueJson) {
      defaultValueJson.addEventListener('blur', (e) => {
        const raw = (e.target.value || '').trim();
        if (!raw) {
          field.defaultValue = (field.data_type === 'array') ? [] : {};
          this.onFieldChange();
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (field.data_type === 'array' && !Array.isArray(parsed)) {
            e.target.value = JSON.stringify(field.defaultValue, null, 2);
            return;
          }
          if (field.data_type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
            e.target.value = JSON.stringify(field.defaultValue || {}, null, 2);
            return;
          }
          field.defaultValue = parsed;
          e.target.value = JSON.stringify(parsed, null, 2);
          this.onFieldChange();
        } catch (err) {
          this.showNotification('JSON inválido en valor por defecto', 'error');
        }
      });
    }
    
    // Type-specific properties
    this.setupTypeSpecificListeners(field);
  };

  P.setupTypeSpecificListeners = function (field) {
    // Text/Textarea: modo corto/largo, tipo de dato, límite, filas
    const stringModeSelect = this.querySelector('#propStringMode');
    const stringDataTypeSelect = this.querySelector('#propStringDataType');
    const maxLengthInput = this.querySelector('#propMaxLength');
    const rowsInput = this.querySelector('#propRows');
    
    if (stringModeSelect) {
      stringModeSelect.addEventListener('change', (e) => {
        const isLong = e.target.value === 'long';
        const tipo = stringDataTypeSelect ? stringDataTypeSelect.value : 'text';
        if (isLong) {
          if (tipo === 'prompt') field.input_type = 'prompt_input';
          else if (tipo === 'system_prompt') field.input_type = 'prompt_system';
          else field.input_type = 'textarea';
          if (field.rows == null) field.rows = 4;
        } else {
          if (tipo === 'website') {
            field.input_type = 'text';
            field.html_type = 'url';
          } else field.input_type = 'text';
          field.html_type = field.html_type === 'url' ? 'url' : undefined;
          delete field.rows;
        }
        this.renderCanvas();
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    if (stringDataTypeSelect) {
      stringDataTypeSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'website') {
          field.input_type = 'text';
          field.html_type = 'url';
          field.rows = undefined;
        } else if (v === 'prompt') {
          field.input_type = 'prompt_input';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else if (v === 'system_prompt') {
          field.input_type = 'prompt_system';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else if (v === 'textarea') {
          field.input_type = 'textarea';
          field.html_type = undefined;
          if (field.rows == null) field.rows = 4;
        } else {
          field.input_type = 'text';
          field.html_type = undefined;
          field.rows = undefined;
        }
        this.renderCanvas();
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    
    if (maxLengthInput) {
      maxLengthInput.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        field.maxLength = val === '' ? undefined : parseInt(val, 10) || undefined;
        this.onFieldChange();
      });
    }
    
    if (rowsInput) {
      rowsInput.addEventListener('change', (e) => {
        field.rows = parseInt(e.target.value, 10) || 4;
        this.onFieldChange();
      });
    }
    
    // Number/Range
    const minInput = this.querySelector('#propMin');
    const maxInput = this.querySelector('#propMax');
    const stepInput = this.querySelector('#propStep');
    const defaultValueInput = this.querySelector('#propDefaultValue');
    
    if (minInput) {
      minInput.addEventListener('change', (e) => {
        field.min = parseFloat(e.target.value) || 0;
        this.onFieldChange();
      });
    }
    
    if (maxInput) {
      maxInput.addEventListener('change', (e) => {
        field.max = parseFloat(e.target.value) || 100;
        this.onFieldChange();
      });
    }
    
    if (stepInput) {
      stepInput.addEventListener('change', (e) => {
        field.step = parseFloat(e.target.value) || 1;
        this.onFieldChange();
      });
    }
    
    if (defaultValueInput) {
      defaultValueInput.addEventListener('change', (e) => {
        field.defaultValue = parseFloat(e.target.value) || null;
        this.onFieldChange();
      });
    }
    
    // Stepper (num_stepper / stepper_num)
    const propStepperMin = this.querySelector('#propStepperMin');
    const propStepperMax = this.querySelector('#propStepperMax');
    const propStepperStep = this.querySelector('#propStepperStep');
    const propStepperDefault = this.querySelector('#propStepperDefault');
    const propStepperUnit = this.querySelector('#propStepperUnit');
    if (propStepperMin) propStepperMin.addEventListener('change', (e) => { field.min = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propStepperMax) propStepperMax.addEventListener('change', (e) => { field.max = parseFloat(e.target.value) || 999; this.onFieldChange(); });
    if (propStepperStep) propStepperStep.addEventListener('change', (e) => { field.step = parseFloat(e.target.value) || 1; this.onFieldChange(); });
    if (propStepperDefault) propStepperDefault.addEventListener('change', (e) => { field.defaultValue = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propStepperUnit) propStepperUnit.addEventListener('input', (e) => { field.unit = e.target.value.trim() || undefined; this.onFieldChange(); });
    
    // Checkbox: valor por defecto
    const propCheckboxDefault = this.querySelector('#propCheckboxDefault');
    if (propCheckboxDefault) {
      propCheckboxDefault.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    // Toggle / Switch: valor por defecto
    const propSwitchDefault = this.querySelector('#propSwitchDefault');
    if (propSwitchDefault) {
      propSwitchDefault.addEventListener('change', (e) => {
        field.defaultValue = e.target.checked;
        this.onFieldChange();
      });
    }
    
    // Sliders: modo, double, min, max, step, valor(es), opciones (string)
    const propSliderMode = this.querySelector('#propSliderMode');
    const propDoubleSlider = this.querySelector('#propDoubleSlider');
    const propSliderMin = this.querySelector('#propSliderMin');
    const propSliderMax = this.querySelector('#propSliderMax');
    const propSliderStep = this.querySelector('#propSliderStep');
    const propSliderDefault = this.querySelector('#propSliderDefault');
    const propSliderValueStart = this.querySelector('#propSliderValueStart');
    const propSliderValueEnd = this.querySelector('#propSliderValueEnd');
    if (propSliderMode) {
      propSliderMode.addEventListener('change', (e) => {
        field.slider_mode = e.target.value;
        if (e.target.value === 'string' && (!Array.isArray(field.options) || field.options.length === 0)) {
          field.options = [{ value: 'bajo', label: 'Bajo' }, { value: 'medio', label: 'Medio' }, { value: 'alto', label: 'Alto' }];
        }
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.onFieldChange();
      });
    }
    if (propDoubleSlider) {
      propDoubleSlider.addEventListener('change', (e) => {
        field.is_double_slider = e.target.checked;
        if (e.target.checked) {
          field.value_start = field.min ?? 0;
          field.value_end = field.max ?? 100;
        } else {
          delete field.value_start;
          delete field.value_end;
        }
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.onFieldChange();
      });
    }
    if (propSliderMin) propSliderMin.addEventListener('change', (e) => { field.min = parseFloat(e.target.value) || 0; this.onFieldChange(); });
    if (propSliderMax) propSliderMax.addEventListener('change', (e) => { field.max = parseFloat(e.target.value) || 100; this.onFieldChange(); });
    if (propSliderStep) propSliderStep.addEventListener('change', (e) => { field.step = parseFloat(e.target.value) || 1; this.onFieldChange(); });
    if (propSliderDefault) propSliderDefault.addEventListener('change', (e) => { field.defaultValue = parseFloat(e.target.value) ?? 50; this.onFieldChange(); });
    if (propSliderValueStart) propSliderValueStart.addEventListener('change', (e) => { field.value_start = parseFloat(e.target.value) ?? field.min; this.onFieldChange(); });
    if (propSliderValueEnd) propSliderValueEnd.addEventListener('change', (e) => { field.value_end = parseFloat(e.target.value) ?? field.max; this.onFieldChange(); });
    
    // Slider string: editor de opciones (mismo patrón que optionsEditor)
    const addOptionBtnSlider = this.querySelector('#addOptionBtnSlider');
    const optionsEditorSlider = this.querySelector('#optionsEditorSlider');
    if (addOptionBtnSlider) {
      addOptionBtnSlider.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '', label: '' });
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    if (optionsEditorSlider) {
      optionsEditorSlider.querySelectorAll('.option-row').forEach((row) => {
        const index = parseInt(row.getAttribute('data-index'), 10);
        const singleInput = row.querySelector('.option-single');
        const removeBtn = row.querySelector('.remove-option');
        if (singleInput) {
          singleInput.addEventListener('input', (e) => {
            const text = e.target.value;
            while (field.options.length <= index) field.options.push({ value: '', label: '' });
            field.options[index].value = text;
            field.options[index].label = text;
            this.renderCanvas();
            this.onFieldChange();
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            field.options.splice(index, 1);
            this.renderPropertiesPanel();
            this.setupTypeSpecificListeners(field);
            this.renderCanvas();
            this.onFieldChange();
          });
        }
      });
    }
    
    const multiselectCheckbox = this.querySelector('#propMultiselect');
    if (multiselectCheckbox) {
      multiselectCheckbox.addEventListener('change', (e) => {
        field.is_multiple = e.target.checked;
        this.onFieldChange();
      });
    }

    const flagsCategorySelect = this.querySelector('#propFlagsCategory');
    if (flagsCategorySelect) {
      flagsCategorySelect.addEventListener('change', (e) => {
        field.flag_category = e.target.value;
        field.flags_category = e.target.value;
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    const flagsMultipleCheckbox = this.querySelector('#propFlagsMultiple');
    if (flagsMultipleCheckbox) {
      flagsMultipleCheckbox.addEventListener('change', (e) => {
        field.is_multiple = e.target.checked;
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    const propColoresMax = this.querySelector('#propColoresMax');
    if (propColoresMax) {
      propColoresMax.addEventListener('input', (e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n) && n >= 1 && n <= 12) {
          field.max_selections = n;
          this.renderCanvas();
          this.onFieldChange();
        }
      });
    }
    const addOptionBtnColores = this.querySelector('#addOptionBtnColores');
    const optionsEditorColores = this.querySelector('#optionsEditorColores');
    if (addOptionBtnColores) {
      addOptionBtnColores.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '#888888', label: 'Nuevo' });
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    if (optionsEditorColores) {
      optionsEditorColores.querySelectorAll('.option-row--color').forEach((row) => {
        const index = parseInt(row.getAttribute('data-index'), 10);
        const hexInput = row.querySelector('.option-color-hex');
        const labelInput = row.querySelector('.option-label');
        const removeBtn = row.querySelector('.remove-option');
        if (hexInput) {
          hexInput.addEventListener('input', (e) => {
            while (field.options.length <= index) field.options.push({ value: '#000000', label: '' });
            field.options[index] = field.options[index] || {};
            field.options[index].value = e.target.value.trim() || '#000000';
            this.renderCanvas();
            this.onFieldChange();
          });
        }
        if (labelInput) {
          labelInput.addEventListener('input', (e) => {
            while (field.options.length <= index) field.options.push({ value: '#000000', label: '' });
            field.options[index] = field.options[index] || {};
            field.options[index].label = e.target.value;
            this.onFieldChange();
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            field.options.splice(index, 1);
            this.renderPropertiesPanel();
            this.setupTypeSpecificListeners(field);
            this.renderCanvas();
            this.onFieldChange();
          });
        }
      });
    }

    // Select/Dropdown/Radio: opciones (un input por opción o valor/etiqueta)
    const addOptionBtn = this.querySelector('#addOptionBtn');
    const optionsEditor = this.querySelector('#optionsEditor');
    
    if (addOptionBtn) {
      addOptionBtn.addEventListener('click', () => {
        if (!field.options) field.options = [];
        field.options.push({ value: '', label: '' });
        this.renderPropertiesPanel();
        this.setupTypeSpecificListeners(field);
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    
    if (optionsEditor) {
      optionsEditor.querySelectorAll('.option-row').forEach((row) => {
        const index = parseInt(row.getAttribute('data-index'), 10);
        const singleInput = row.querySelector('.option-single');
        const valueInput = row.querySelector('.option-value');
        const labelInput = row.querySelector('.option-label');
        const removeBtn = row.querySelector('.remove-option');
        
        if (singleInput) {
          singleInput.addEventListener('input', (e) => {
            const text = e.target.value;
            while (field.options.length <= index) field.options.push({ value: '', label: '' });
            field.options[index].value = text;
            field.options[index].label = text;
            this.renderCanvas();
            this.onFieldChange();
          });
        }
        if (valueInput) {
          valueInput.addEventListener('input', (e) => {
            if (!field.options[index]) field.options[index] = {};
            if (typeof field.options[index] === 'string') {
              field.options[index] = { value: e.target.value, label: field.options[index] };
            } else {
              field.options[index].value = e.target.value;
            }
            this.onFieldChange();
          });
        }
        if (labelInput) {
          labelInput.addEventListener('input', (e) => {
            if (!field.options[index]) field.options[index] = {};
            if (typeof field.options[index] === 'string') {
              field.options[index] = { value: field.options[index], label: e.target.value };
            } else {
              field.options[index].label = e.target.value;
            }
            this.onFieldChange();
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            field.options.splice(index, 1);
            this.renderPropertiesPanel();
            this.setupTypeSpecificListeners(field);
            this.renderCanvas();
            this.onFieldChange();
          });
        }
      });
    }
    
    // Entity types
    const entityTypeCheckboxes = this.querySelectorAll('.entity-types-toggles input[data-type]');
    entityTypeCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        field.entityTypes = Array.from(this.querySelectorAll('.entity-types-toggles input[data-type]:checked'))
          .map(cb => cb.dataset.type);
        this.onFieldChange();
      });
    });
    
    const contextSelectorTypeSelect = this.querySelector('#propContextSelectorType');
    if (contextSelectorTypeSelect) {
      contextSelectorTypeSelect.addEventListener('change', (e) => {
        field.context_selector_type = e.target.value;
        this.onFieldChange();
      });
    }
    
    const mediaSourceSelect = this.querySelector('#propMediaSource');
    if (mediaSourceSelect) {
      mediaSourceSelect.addEventListener('change', (e) => {
        field.media_source = e.target.value;
        field.function_type = e.target.value;
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    const imageSelectionModeSelect = this.querySelector('#propImageSelectionMode');
    if (imageSelectionModeSelect) {
      imageSelectionModeSelect.addEventListener('change', (e) => {
        field.image_selection_mode = e.target.value;
        field.selection_mode = e.target.value;
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    const imageInputDataSelect = this.querySelector('#propImageInputData');
    if (imageInputDataSelect) {
      imageInputDataSelect.addEventListener('change', (e) => {
        field.image_input_data = e.target.value;
        const wrap = this.querySelector('#propImageProductFieldsWrap');
        if (wrap) wrap.style.display = e.target.value === 'specific' ? 'block' : 'none';
        this.onFieldChange();
      });
    }

    this.querySelectorAll('.property-product-fields input[type="checkbox"][data-field]').forEach(cb => {
      cb.addEventListener('change', () => {
        field.image_product_fields = Array.from(this.querySelectorAll('.property-product-fields input[type="checkbox"][data-field]:checked'))
          .map(el => el.dataset.field);
        this.onFieldChange();
      });
    });

    const propFilterProducts = this.querySelector('#propFilterProducts');
    if (propFilterProducts) {
      propFilterProducts.addEventListener('change', (e) => {
        field.filter_products = e.target.checked;
        this.onFieldChange();
      });
    }
    const propFilterReferences = this.querySelector('#propFilterReferences');
    if (propFilterReferences) {
      propFilterReferences.addEventListener('change', (e) => {
        field.filter_references = e.target.checked;
        this.onFieldChange();
      });
    }
  };

  P.onFieldChange = function () {
    this.hasUnsavedChanges = true;
    this.debouncedRefreshUI();
  };

  P.updateJsonPreview = function () {
    const preview = this.querySelector('#jsonSchemaPreview code');
    if (!preview) return;
    
    const schema = {
      fields: this.inputSchema
    };
    
    preview.textContent = JSON.stringify(schema, null, 2);
  };

  P.generateFormPreview = function () {
    if (this.inputSchema.length === 0) {
      return `
        <div class="preview-empty">
          <i class="ph ph-warning"></i>
          <p>No hay campos definidos</p>
        </div>
      `;
    }
    const columns = this.uiLayoutConfig.columns || 1;
    const showLabels = this.uiLayoutConfig.showLabels !== false;
    const showHelperText = this.uiLayoutConfig.showHelperText !== false;
    const Registry = window.InputRegistry;
    const fieldsHtml = this.inputSchema.map(field => {
      const widthClass = field.ui?.width === 'half' ? 'col-half' : field.ui?.width === 'third' ? 'col-third' : 'col-full';
      if (Registry && Registry.renderFormFieldWithWrapper) {
        return Registry.renderFormFieldWithWrapper(field, {
          idPrefix: 'preview_',
          wrapperClass: 'preview-field ' + widthClass,
          showLabel: showLabels,
          showHelper: showHelperText,
          showRequired: true,
          required: field.required,
          disabled: false,
          helperClass: 'helper-text'
        });
      }
      const ph = (field.placeholder || '').replace(/"/g, '&quot;');
      return `<div class="preview-field ${widthClass}"><label>${field.label || field.key}</label><input type="text" name="${field.key || 'field'}" placeholder="${ph}"></div>`;
    }).join('');
    const submitPosition = this.uiLayoutConfig.submitButtonPosition || 'right';
    const submitText = this.uiLayoutConfig.submitButtonText || 'Generar';
    return `
      <div class="preview-form theme-${this.uiLayoutConfig.theme || 'default'}" style="--preview-columns: ${columns}">
        <div class="preview-fields">
          ${fieldsHtml}
        </div>
        <div class="preview-actions position-${submitPosition}">
          <button class="btn-primary preview-submit">
            <i class="ph ph-sparkle"></i>
            ${submitText}
          </button>
        </div>
      </div>
    `;
  };

})();
