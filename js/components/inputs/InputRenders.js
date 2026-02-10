/**
 * InputRenders.js
 * Renders dinámicos para inputs del Builder/Studio.
 * Mapea input_type a plantillas: DataCarousel, VisualGrid, SmartDropdown,
 * ParameterControl, ColorPalette, MediaUpload; fallback a controles clásicos.
 */

(function (global) {
  'use strict';

  function escapeAttr(str) {
    if (str == null) return '';
    const s = String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Determina el tipo de componente a partir del field.
   * @param {Object} field - { input_type, dataSource, displayType, ... }
   * @returns {string|null} - 'data-carousel' | 'visual-grid' | 'smart-dropdown' | 'parameter-control' | 'color-palette' | 'media-upload' | null
   */
  function getComponentType(field) {
    const type = (field.input_type || field.type || '').toLowerCase();
    if (['smart-product-selector', 'smart-style-selector'].includes(type)) return 'data-carousel';
    if (['visual-select', 'card-select'].includes(type)) return 'visual-grid';
    if (['smart-dropdown', 'icon-select'].includes(type) || (type === 'select' && (field.dataSource || field.enum))) return 'smart-dropdown';
    if (['slider', 'slider-select', 'switch', 'number'].includes(type)) return 'parameter-control';
    if (type === 'color-picker') return 'color-palette';
    if (['file-upload', 'image-upload'].includes(type)) return 'media-upload';
    return null;
  }

  /**
   * Contexto de render: mode ('preview' | 'test' | 'studio'), namePrefix, idPrefix
   */
  function defaultContext(ctx) {
    return {
      mode: ctx?.mode || 'studio',
      namePrefix: ctx?.namePrefix != null ? ctx.namePrefix : '',
      idPrefix: ctx?.idPrefix != null ? ctx.idPrefix : 'field-',
      required: ctx?.required !== false
    };
  }

  function nameFor(field, ctx) {
    const key = field.key || field.name || field.id || 'field';
    return ctx.namePrefix ? ctx.namePrefix + key : key;
  }

  function idFor(field, ctx) {
    const key = field.key || field.name || field.id || 'field';
    return (ctx.idPrefix || 'field-') + key;
  }

  // ---------- 1. DataCarousel ----------
  // smart-product-selector (Único/Múltiple), smart-style-selector
  // dataSource: "products" | "references", mode: "single" | "multiple", omittable_fields
  function renderDataCarousel(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const dataSource = field.dataSource || 'products';
    const mode = field.mode || 'single';
    const omittable = field.omittable_fields || [];
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-data-carousel" data-input-type="data-carousel" data-name="${escapeAttr(name)}">
          <div class="data-carousel-preview-stub">
            <i class="ph ph-cards"></i>
            <span>Carrusel ${mode === 'multiple' ? '(múltiple)' : '(único)'} — ${dataSource}</span>
          </div>
        </div>
      `;
    }

    const multiAttr = mode === 'multiple' ? ' data-multiple="true"' : '';
    const omitJson = escapeAttr(JSON.stringify(omittable));
    return `
      <div class="input-component input-data-carousel" data-input-type="data-carousel" data-name="${escapeAttr(name)}" data-data-source="${escapeAttr(dataSource)}" data-mode="${escapeAttr(mode)}" data-omittable-fields="${omitJson}">
        <div class="data-carousel-track" role="listbox" aria-multiselectable="${mode === 'multiple'}">
          <div class="data-carousel-loading"><i class="ph ph-spinner ph-spin"></i> Cargando…</div>
        </div>
        ${omittable.length ? `
          <div class="data-carousel-omittable" data-omittable-fields="${omitJson}"></div>
        ` : ''}
        <input type="hidden" name="${escapeAttr(name)}" id="${escapeAttr(id)}" value="" ${ctx.required && field.required !== false ? 'required' : ''}>
      </div>
    `;
  }

  // ---------- 2. VisualGrid ----------
  // visual-select, card-select — displayType: icon | thumbnail | emoji
  function renderVisualGrid(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const displayType = field.displayType || 'icon';
    const options = field.options || field.items || [];
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-visual-grid" data-input-type="visual-grid" data-name="${escapeAttr(name)}">
          <div class="visual-grid-preview-stub">
            <i class="ph ph-squares-four"></i>
            <span>Grilla ${displayType}</span>
          </div>
        </div>
      `;
    }

    const gridClass = displayType === 'thumbnail' ? ' visual-grid--thumbnail' : displayType === 'emoji' ? ' visual-grid--emoji' : ' visual-grid--icon';
    const itemsHtml = options.map((opt, i) => {
      const v = opt.value != null ? opt.value : opt.id ?? i;
      const label = escapeHtml(opt.label || opt.name || String(v));
      if (displayType === 'emoji') {
        return `<button type="button" class="visual-grid-item" data-value="${escapeAttr(v)}" data-index="${i}"><span class="visual-grid-emoji">${escapeHtml(opt.emoji || '☐')}</span><span class="visual-grid-label">${label}</span></button>`;
      }
      if (displayType === 'thumbnail' && opt.imageUrl) {
        return `<button type="button" class="visual-grid-item" data-value="${escapeAttr(v)}" data-index="${i}"><img src="${escapeAttr(opt.imageUrl)}" alt="${label}"><span class="visual-grid-label">${label}</span></button>`;
      }
      const icon = opt.icon ? `<i class="${escapeAttr(opt.icon)}"></i>` : '';
      return `<button type="button" class="visual-grid-item" data-value="${escapeAttr(v)}" data-index="${i}">${icon}<span class="visual-grid-label">${label}</span></button>`;
    }).join('');

    return `
      <div class="input-component input-visual-grid${gridClass}" data-input-type="visual-grid" data-name="${escapeAttr(name)}" data-display-type="${escapeAttr(displayType)}">
        <div class="visual-grid-inner" role="group" aria-label="${escapeAttr(field.label || name)}">
          ${itemsHtml}
        </div>
        <input type="hidden" name="${escapeAttr(name)}" id="${escapeAttr(id)}" value="" ${ctx.required && field.required !== false ? 'required' : ''}>
      </div>
    `;
  }

  // ---------- 3. SmartDropdown ----------
  // smart-dropdown (campañas, audiencias), select, icon-select (dataSource o enum)
  function renderSmartDropdown(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const dataSource = field.dataSource || '';
    const enumList = field.enum || field.options || [];
    const withIcon = field.withIcon === true || field.input_type === 'icon-select';
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-smart-dropdown" data-input-type="smart-dropdown" data-name="${escapeAttr(name)}">
          <div class="smart-dropdown-preview-stub">
            <i class="ph ph-caret-down"></i>
            <span>${dataSource ? 'Dropdown (' + dataSource + ')' : 'Lista'}</span>
          </div>
        </div>
      `;
    }

    const opts = enumList.map(o => {
      const v = o.value != null ? o.value : o;
      const label = o.label != null ? o.label : String(v);
      const icon = withIcon && o.icon ? `<i class="${escapeAttr(o.icon)}"></i>` : '';
      return `<option value="${escapeAttr(v)}">${icon ? icon + ' ' : ''}${escapeHtml(label)}</option>`;
    }).join('');

    const selectHtml = dataSource
      ? `<select name="${escapeAttr(name)}" id="${escapeAttr(id)}" class="smart-dropdown-select" data-data-source="${escapeAttr(dataSource)}" ${ctx.required && field.required !== false ? 'required' : ''}><option value="">${escapeHtml(field.placeholder || 'Seleccionar...')}</option></select>`
      : `<select name="${escapeAttr(name)}" id="${escapeAttr(id)}" class="smart-dropdown-select" ${ctx.required && field.required !== false ? 'required' : ''}><option value="">${escapeHtml(field.placeholder || 'Seleccionar...')}</option>${opts}</select>`;

    return `
      <div class="input-component input-smart-dropdown" data-input-type="smart-dropdown" data-name="${escapeAttr(name)}">
        ${selectHtml}
      </div>
    `;
  }

  // ---------- 4. ParameterControl ----------
  // slider, slider-select (snap points), switch, number
  function renderParameterControl(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const type = (field.input_type || field.type || 'number').toLowerCase();
    const min = field.min != null ? field.min : 0;
    const max = field.max != null ? field.max : 100;
    const step = field.step != null ? field.step : 1;
    const defaultValue = field.defaultValue != null ? field.defaultValue : (type === 'switch' ? false : type === 'number' ? '' : 50);
    const snapPoints = field.snapPoints || [];
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-parameter-control" data-input-type="parameter-control" data-name="${escapeAttr(name)}">
          <div class="parameter-control-preview-stub">
            <i class="ph ph-sliders-horizontal"></i>
            <span>${type === 'switch' ? 'Switch' : type === 'slider-select' ? 'Slider (puntos)' : type}</span>
          </div>
        </div>
      `;
    }

    if (type === 'switch') {
      const checked = defaultValue === true || defaultValue === 'true' || defaultValue === 1;
      return `
        <div class="input-component input-parameter-control input-parameter-switch" data-input-type="parameter-control" data-name="${escapeAttr(name)}">
          <label class="parameter-switch-wrap">
            <input type="checkbox" name="${escapeAttr(name)}" id="${escapeAttr(id)}" ${checked ? 'checked' : ''} ${ctx.required && field.required !== false ? 'required' : ''} class="parameter-switch-input">
            <span class="parameter-switch-slider"></span>
            <span class="parameter-switch-label">${escapeHtml(field.label || name)}</span>
          </label>
        </div>
      `;
    }

    if (type === 'number') {
      return `
        <div class="input-component input-parameter-control input-parameter-number" data-input-type="parameter-control" data-name="${escapeAttr(name)}">
          <input type="number" name="${escapeAttr(name)}" id="${escapeAttr(id)}" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(step)}" value="${escapeAttr(defaultValue)}" placeholder="${escapeAttr(field.placeholder || '')}" ${ctx.required && field.required !== false ? 'required' : ''} class="parameter-number-input">
        </div>
      `;
    }

    const snapJson = escapeAttr(JSON.stringify(snapPoints));
    const isSliderSelect = type === 'slider-select';
    return `
      <div class="input-component input-parameter-control input-parameter-slider" data-input-type="parameter-control" data-name="${escapeAttr(name)}" data-snap-points="${snapJson}">
        <div class="parameter-slider-wrap">
          <input type="range" name="${escapeAttr(name)}" id="${escapeAttr(id)}" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(isSliderSelect && snapPoints.length ? 'any' : step)}" value="${escapeAttr(defaultValue)}" class="parameter-range-input" ${ctx.required && field.required !== false ? 'required' : ''}>
          <output class="parameter-range-value" for="${escapeAttr(id)}">${escapeHtml(defaultValue)}</output>
        </div>
      </div>
    `;
  }

  // ---------- 5. ColorPalette ----------
  // color-picker — círculos, soporta gradientes (linear-gradient en value)
  function renderColorPalette(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const options = field.options || field.colors || [];
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-color-palette" data-input-type="color-palette" data-name="${escapeAttr(name)}">
          <div class="color-palette-preview-stub">
            <i class="ph ph-palette"></i>
            <span>Paleta de colores</span>
          </div>
        </div>
      `;
    }

    const itemsHtml = options.map((opt, i) => {
      const v = opt.value != null ? opt.value : (opt.color || opt);
      const label = escapeHtml(opt.label || opt.name || '');
      const isGradient = String(v).startsWith('linear-gradient') || String(v).startsWith('radial-gradient');
      const style = isGradient ? `style="background: ${escapeAttr(v)}"` : `style="background-color: ${escapeAttr(v)}"`;
      return `<button type="button" class="color-palette-swatch" data-value="${escapeAttr(v)}" ${style} title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"></button>`;
    }).join('');

    return `
      <div class="input-component input-color-palette" data-input-type="color-palette" data-name="${escapeAttr(name)}">
        <div class="color-palette-inner" role="group">
          ${itemsHtml}
        </div>
        <input type="hidden" name="${escapeAttr(name)}" id="${escapeAttr(id)}" value="" ${ctx.required && field.required !== false ? 'required' : ''}>
      </div>
    `;
  }

  // ---------- 6. MediaUpload ----------
  // file-upload, image-upload — drag & drop, previsualización
  function renderMediaUpload(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const accept = field.accept || 'image/*';
    const maxFiles = field.maxFiles != null ? field.maxFiles : 1;
    const isPreview = ctx.mode === 'preview';

    if (isPreview) {
      return `
        <div class="input-component input-media-upload" data-input-type="media-upload" data-name="${escapeAttr(name)}">
          <div class="media-upload-preview-stub">
            <i class="ph ph-upload-simple"></i>
            <span>Subir archivo(s)</span>
          </div>
        </div>
      `;
    }

    const multiAttr = maxFiles > 1 ? ` data-max-files="${maxFiles}"` : '';
    return `
      <div class="input-component input-media-upload" data-input-type="media-upload" data-name="${escapeAttr(name)}" data-accept="${escapeAttr(accept)}"${multiAttr}>
        <div class="media-upload-dropzone" role="button" tabindex="0" aria-label="Arrastra archivos o haz clic">
          <input type="file" name="${escapeAttr(name)}" id="${escapeAttr(id)}" accept="${escapeAttr(accept)}" ${maxFiles > 1 ? 'multiple' : ''} ${ctx.required && field.required !== false ? 'required' : ''} class="media-upload-input" hidden>
          <i class="ph ph-upload-simple"></i>
          <span class="media-upload-text">Arrastra archivos aquí o haz clic</span>
        </div>
        <div class="media-upload-preview-list"></div>
      </div>
    `;
  }

  // ---------- Legacy (text, textarea, select, checkbox, radio, range) ----------
  function renderLegacy(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const type = (field.input_type || field.type || 'text').toLowerCase();
    const required = ctx.required && field.required !== false;
    const reqAttr = required ? ' required' : '';
    const placeholder = escapeAttr(field.placeholder || '');
    const label = escapeHtml(field.label || field.key || name);

    switch (type) {
      case 'textarea':
        return `
          <div class="input-component input-legacy">
            <label for="${escapeAttr(id)}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
            <textarea name="${escapeAttr(name)}" id="${escapeAttr(id)}" rows="${field.rows || 4}" placeholder="${placeholder}"${reqAttr}></textarea>
          </div>
        `;
      case 'select':
        const options = field.options || [];
        const opts = options.map(o => `<option value="${escapeAttr(o.value ?? o)}">${escapeHtml(o.label ?? o)}</option>`).join('');
        return `
          <div class="input-component input-legacy">
            <label for="${escapeAttr(id)}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
            <select name="${escapeAttr(name)}" id="${escapeAttr(id)}"${reqAttr}>
              <option value="">${escapeHtml(field.placeholder || 'Seleccionar...')}</option>
              ${opts}
            </select>
          </div>
        `;
      case 'number':
        return `
          <div class="input-component input-legacy">
            <label for="${escapeAttr(id)}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
            <input type="number" name="${escapeAttr(name)}" id="${escapeAttr(id)}" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${escapeAttr(field.defaultValue ?? '')}" placeholder="${placeholder}"${reqAttr}>
          </div>
        `;
      case 'checkbox':
        return `
          <div class="input-component input-legacy">
            <label class="legacy-checkbox-label">
              <input type="checkbox" name="${escapeAttr(name)}" id="${escapeAttr(id)}" ${field.defaultValue ? 'checked' : ''}${reqAttr}>
              <span>${label}</span>
            </label>
          </div>
        `;
      case 'radio':
        const radios = (field.options || []).map((opt, i) => `
          <label class="legacy-radio-label">
            <input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(opt.value ?? opt)}" ${i === 0 ? 'checked' : ''}>
            <span>${escapeHtml(opt.label ?? opt)}</span>
          </label>
        `).join('');
        return `
          <div class="input-component input-legacy">
            <span class="legacy-radio-group-label">${label}${required ? ' <span class="required">*</span>' : ''}</span>
            <div class="legacy-radio-group">${radios}</div>
          </div>
        `;
      case 'range':
        const def = field.defaultValue ?? 50;
        return `
          <div class="input-component input-legacy">
            <label for="${escapeAttr(id)}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
            <div class="legacy-range-wrap">
              <input type="range" name="${escapeAttr(name)}" id="${escapeAttr(id)}" min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}" value="${def}"${reqAttr}>
              <output class="legacy-range-value" for="${escapeAttr(id)}">${escapeHtml(def)}</output>
            </div>
          </div>
        `;
      default:
        return `
          <div class="input-component input-legacy">
            <label for="${escapeAttr(id)}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
            <input type="text" name="${escapeAttr(name)}" id="${escapeAttr(id)}" placeholder="${placeholder}"${reqAttr}>
          </div>
        `;
    }
  }

  const RENDERERS = {
    'data-carousel': renderDataCarousel,
    'visual-grid': renderVisualGrid,
    'smart-dropdown': renderSmartDropdown,
    'parameter-control': renderParameterControl,
    'color-palette': renderColorPalette,
    'media-upload': renderMediaUpload
  };

  /**
   * Renderiza un campo según su input_type (plantilla dinámica o legacy).
   * @param {Object} field - Definición del campo (key, label, input_type, options, dataSource, etc.)
   * @param {Object} [context] - { mode: 'preview'|'test'|'studio', namePrefix, idPrefix, required }
   * @returns {string} HTML del campo
   */
  function renderField(field, context) {
    const ctx = defaultContext(context);
    const componentType = getComponentType(field);
    const fn = componentType ? RENDERERS[componentType] : null;
    if (fn) return fn(field, ctx);
    return renderLegacy(field, ctx);
  }

  /**
   * Envuelve el HTML del campo en un contenedor estándar (label + help) para uso en formularios.
   */
  function renderFieldWithWrapper(field, context) {
    const label = field.label || field.key || field.name || 'Campo';
    const required = (context?.required !== false) && field.required;
    const help = field.description ? `<span class="field-help">${escapeHtml(field.description)}</span>` : '';
    const inner = renderField(field, context);
    return `
      <div class="input-field-wrap" data-field-key="${escapeAttr(field.key || field.name || '')}">
        <label class="input-field-label">${escapeHtml(label)}${required ? ' <span class="required">*</span>' : ''}</label>
        ${inner}
        ${help}
      </div>
    `;
  }

  /**
   * Inicializa comportamientos de los componentes dinámicos dentro de un contenedor
   * (VisualGrid click, ColorPalette click, Parameter range output, MediaUpload dropzone).
   * @param {Element} container - Elemento que contiene los .input-component
   */
  function initInputComponents(container) {
    if (!container) return;
    const root = container instanceof Element ? container : document.querySelector(container);

    // VisualGrid: click en item -> selección única y valor en hidden
    root.querySelectorAll('.input-visual-grid').forEach(wrap => {
      const hidden = wrap.querySelector('input[type="hidden"]');
      const name = wrap.getAttribute('data-name');
      if (!hidden) return;
      wrap.querySelectorAll('.visual-grid-item').forEach(item => {
        item.addEventListener('click', function () {
          const multiple = wrap.getAttribute('data-multiple') === 'true';
          const val = this.getAttribute('data-value');
          if (multiple) {
            const current = (hidden.value || '').split(',').filter(Boolean);
            const idx = current.indexOf(val);
            if (idx >= 0) current.splice(idx, 1);
            else current.push(val);
            hidden.value = current.join(',');
            wrap.querySelectorAll('.visual-grid-item').forEach(i => i.classList.toggle('selected', current.indexOf(i.getAttribute('data-value')) >= 0));
          } else {
            wrap.querySelectorAll('.visual-grid-item').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            hidden.value = val || '';
          }
        });
      });
    });

    // ColorPalette: click en swatch -> selección y valor en hidden
    root.querySelectorAll('.input-color-palette').forEach(wrap => {
      const hidden = wrap.querySelector('input[type="hidden"]');
      if (!hidden) return;
      wrap.querySelectorAll('.color-palette-swatch').forEach(sw => {
        sw.addEventListener('click', function () {
          wrap.querySelectorAll('.color-palette-swatch').forEach(s => s.classList.remove('selected'));
          this.classList.add('selected');
          hidden.value = this.getAttribute('data-value') || '';
        });
      });
    });

    // Parameter range: actualizar output
    root.querySelectorAll('.parameter-range-input').forEach(range => {
      const out = root.querySelector('.parameter-range-value[for="' + range.id + '"]') || range.closest('.parameter-slider-wrap')?.querySelector('.parameter-range-value');
      if (out) {
        range.addEventListener('input', function () { out.textContent = this.value; });
      }
    });

    // Legacy range: actualizar output
    root.querySelectorAll('.legacy-range-wrap input[type="range"]').forEach(range => {
      const out = root.querySelector('.legacy-range-value[for="' + range.id + '"]') || range.closest('.legacy-range-wrap')?.querySelector('.legacy-range-value');
      if (out) {
        range.addEventListener('input', function () { out.textContent = this.value; });
      }
    });

    // MediaUpload: dropzone click, drag-over, change en file input, preview
    root.querySelectorAll('.input-media-upload').forEach(wrap => {
      const dropzone = wrap.querySelector('.media-upload-dropzone');
      const fileInput = wrap.querySelector('.media-upload-input');
      const previewList = wrap.querySelector('.media-upload-preview-list');
      if (!dropzone || !fileInput) return;
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        this.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', function () { this.classList.remove('drag-over'); });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (e.dataTransfer.files.length) fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      fileInput.addEventListener('change', function () {
        if (!previewList) return;
        previewList.innerHTML = '';
        const files = Array.from(this.files || []);
        files.forEach((file, i) => {
          const div = document.createElement('div');
          div.className = 'preview-item';
          if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            div.appendChild(img);
          } else {
            div.textContent = file.name;
          }
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'preview-item-remove';
          rm.innerHTML = '×';
          rm.addEventListener('click', () => {
            const dt = new DataTransfer();
            files.forEach((f, j) => { if (j !== i) dt.items.add(f); });
            fileInput.files = dt.files;
            div.remove();
          });
          div.appendChild(rm);
          previewList.appendChild(div);
        });
      });
    });
  }

  // API pública
  const InputRenders = {
    getComponentType,
    renderField,
    renderFieldWithWrapper,
    initInputComponents,
    RENDERERS,
    escapeHtml,
    escapeAttr
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputRenders;
  } else {
    global.InputRenders = InputRenders;
  }
})(typeof window !== 'undefined' ? window : this);
