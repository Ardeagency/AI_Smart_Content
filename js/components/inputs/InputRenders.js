/**
 * InputRenders.js — Biblioteca de Renderizado (UI Kit)
 * Despachador central que mapea ui_type (DB) a componentes con "cuerpo" visual específico.
 * Independientemente del input type, cada uno tiene su formato ya definido.
 *
 * Categorías: basic, selectors, visual, media, layout.
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

  /** ui_type canónico: DB puede enviar ui_type, input_type o type */
  function getUiType(field) {
    return (field.ui_type || field.input_type || field.type || 'text').toLowerCase().trim();
  }

  /**
   * Gran Despachador: mapea ui_type de la base de datos al componente de la biblioteca.
   * @param {Object} field - { ui_type, input_type, key, label, options, ... }
   * @returns {string|null} - clave del componente o null para fallback legacy
   */
  function getComponentType(field) {
    const type = getUiType(field);
    const typeNorm = type.replace(/_/g, '-'); // image_carousel -> image-carousel

    // --- BÁSICOS ---
    if (['text', 'email', 'url', 'tel'].includes(type)) return 'base-input';
    if (['textarea', 'long-text'].includes(type)) return 'text-area';
    if (['number', 'integer', 'float'].includes(type)) return 'number-input';
    if (['tags', 'multi-select'].includes(type)) return 'tag-input';

    // --- SELECTORES ---
    if (['select', 'smart-dropdown', 'icon-select'].includes(type)) return 'smart-select';
    if (['radio', 'segmented-control'].includes(type)) return 'radio-group';
    if (['checkbox', 'checklist'].includes(type)) return 'checkbox-group';
    if (['switch', 'boolean'].includes(type)) return 'toggle-switch';

    // --- VISUALES ---
    if (['visual-select', 'card-select'].includes(type)) return 'visual-grid';
    const carouselTypes = ['smart-product-selector', 'smart-style-selector', 'image-carousel', 'image_carousel', 'product-selector', 'product_selector', 'style-selector', 'style_selector'];
    if (carouselTypes.includes(type) || carouselTypes.includes(typeNorm)) return 'data-carousel';
    if (['color-picker', 'color_picker'].includes(type)) return 'color-palette';
    if (['slider', 'slider-select', 'slider_select'].includes(type)) return 'range-slider';

    // --- MEDIA ---
    if (['file-upload', 'file_upload', 'image-import', 'image_import', 'audio-import', 'audio_import', 'image-upload', 'image_upload'].includes(type)) return 'file-uploader';

    // --- LAYOUT (no guardan valor) ---
    if (['label', 'divider', 'heading'].includes(type)) return 'section-label';
    if (type === 'stepper') return 'step-wizard';
    if (type === 'tabs') return 'tab-container';
    if (['alert', 'info'].includes(type)) return 'info-alert';

    return null;
  }

  /** Componentes que son solo estructura/info (no envían name/value al submit) */
  const LAYOUT_OR_DECORATIVE = ['section-label', 'step-wizard', 'tab-container', 'info-alert'];

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

  // ========== BIBLIOTECA EXTENDIDA (UI Kit) ==========

  // --- BaseInput: text, email, url, tel ---
  function renderBaseInput(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const uiType = getUiType(field);
    const inputType = ['email', 'url', 'tel'].includes(uiType) ? uiType : 'text';
    const placeholder = escapeAttr(field.placeholder || '');
    const value = escapeAttr(field.defaultValue ?? '');
    const req = ctx.required && field.required !== false ? ' required' : '';
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-base-input" data-ui-type="base-input"><div class="base-input-preview-stub"><i class="ph ph-textbox"></i><span>${escapeHtml(inputType)}</span></div></div>`;
    }
    return `
      <div class="input-component input-base-input" data-ui-type="base-input">
        <input type="${escapeAttr(inputType)}" name="${escapeAttr(name)}" id="${escapeAttr(id)}" placeholder="${placeholder}" value="${value}"${req} class="base-input-field" autocomplete="off">
      </div>
    `;
  }

  // --- TextArea: textarea, long-text ---
  function renderTextArea(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const placeholder = escapeAttr(field.placeholder || '');
    const rows = field.rows != null ? field.rows : 4;
    const req = ctx.required && field.required !== false ? ' required' : '';
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-text-area" data-ui-type="text-area"><div class="text-area-preview-stub"><i class="ph ph-text-align-left"></i><span>Párrafo largo</span></div></div>`;
    }
    return `
      <div class="input-component input-text-area" data-ui-type="text-area">
        <textarea name="${escapeAttr(name)}" id="${escapeAttr(id)}" rows="${rows}" placeholder="${placeholder}"${req} class="text-area-field"></textarea>
      </div>
    `;
  }

  // --- NumberInput: number, integer, float (min/max/step) ---
  function renderNumberInput(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const min = field.min != null ? field.min : '';
    const max = field.max != null ? field.max : '';
    const step = field.step != null ? field.step : (getUiType(field) === 'integer' ? 1 : 'any');
    const value = escapeAttr(field.defaultValue ?? '');
    const req = ctx.required && field.required !== false ? ' required' : '';
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-number-input" data-ui-type="number-input"><div class="number-input-preview-stub"><i class="ph ph-hash"></i><span>Número</span></div></div>`;
    }
    return `
      <div class="input-component input-number-input" data-ui-type="number-input">
        <input type="number" name="${escapeAttr(name)}" id="${escapeAttr(id)}" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(step)}" value="${value}"${req} class="number-input-field" placeholder="${escapeAttr(field.placeholder || '')}">
      </div>
    `;
  }

  // --- TagInput: tags, multi-select (chips) ---
  function renderTagInput(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const placeholder = escapeAttr(field.placeholder || 'Añadir… Enter para agregar');
    const options = field.options || field.suggestions || [];
    const defaultValue = field.defaultValue;
    const initialValues = Array.isArray(defaultValue) ? defaultValue : (typeof defaultValue === 'string' && defaultValue ? defaultValue.split(',').map(s => s.trim()) : []);
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-tag-input" data-ui-type="tag-input"><div class="tag-input-preview-stub"><i class="ph ph-tag"></i><span>Etiquetas / multi-select</span></div></div>`;
    }
    const suggestionsHtml = options.length ? options.map((opt, i) => {
      const v = opt.value != null ? opt.value : opt;
      const label = escapeHtml(opt.label != null ? opt.label : String(v));
      return `<button type="button" class="tag-suggestion" data-value="${escapeAttr(v)}">${label}</button>`;
    }).join('') : '';
    return `
      <div class="input-component input-tag-input" data-ui-type="tag-input" data-name="${escapeAttr(name)}">
        <div class="tag-input-chips-wrap">
          <div class="tag-chips" data-chips></div>
          <input type="text" class="tag-input-field" placeholder="${placeholder}" data-tag-input autocomplete="off">
        </div>
        ${suggestionsHtml ? `<div class="tag-suggestions">${suggestionsHtml}</div>` : ''}
        <input type="hidden" name="${escapeAttr(name)}" id="${escapeAttr(id)}" value="${escapeAttr(initialValues.join(','))}" ${ctx.required && field.required !== false ? 'required' : ''}>
      </div>
    `;
  }

  // --- RadioGroup: radio (clásico) o segmented-control (botones pegados) ---
  function renderRadioGroup(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const variant = getUiType(field) === 'segmented-control' ? 'segmented' : 'radio';
    const options = field.options || field.enum || [];
    const defaultValue = field.defaultValue;
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-radio-group" data-ui-type="radio-group"><div class="radio-group-preview-stub"><i class="ph ph-radio-button"></i><span>${variant === 'segmented' ? 'Segmented' : 'Radio'}</span></div></div>`;
    }
    const groupId = id + '-group';
    const optsHtml = options.map((opt, i) => {
      const v = opt.value != null ? opt.value : opt;
      const label = escapeHtml(opt.label != null ? opt.label : String(v));
      const checked = (defaultValue != null && String(defaultValue) === String(v)) || (defaultValue == null && i === 0);
      const optId = id + '-opt-' + i;
      if (variant === 'segmented') {
        return `<label class="radio-segment"><input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(v)}" ${checked ? 'checked' : ''} id="${escapeAttr(optId)}"><span>${label}</span></label>`;
      }
      return `<label class="radio-option"><input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(v)}" ${checked ? 'checked' : ''} id="${escapeAttr(optId)}"><span>${label}</span></label>`;
    }).join('');
    return `
      <div class="input-component input-radio-group input-radio-group--${variant}" data-ui-type="radio-group" role="radiogroup" aria-labelledby="${escapeAttr(groupId)}">
        <div class="radio-group-inner" id="${escapeAttr(groupId)}">${optsHtml}</div>
      </div>
    `;
  }

  // --- CheckboxGroup: checkbox (uno) o checklist (varios) ---
  function renderCheckboxGroup(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const isChecklist = getUiType(field) === 'checklist';
    const options = isChecklist ? (field.options || field.items || []) : [];
    const defaultValue = field.defaultValue;
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-checkbox-group" data-ui-type="checkbox-group"><div class="checkbox-group-preview-stub"><i class="ph ph-check-square"></i><span>${isChecklist ? 'Checklist' : 'Sí/No'}</span></div></div>`;
    }
    if (isChecklist) {
      const defaultSet = Array.isArray(defaultValue) ? defaultValue : (typeof defaultValue === 'string' ? defaultValue.split(',') : []);
      const checksHtml = options.map((opt, i) => {
        const v = opt.value != null ? opt.value : opt;
        const label = escapeHtml(opt.label != null ? opt.label : String(v));
        const checked = defaultSet.indexOf(String(v)) >= 0;
        return `<label class="checklist-item"><input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(v)}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
      }).join('');
      return `
        <div class="input-component input-checkbox-group input-checkbox-group--checklist" data-ui-type="checkbox-group">
          <div class="checklist-inner">${checksHtml}</div>
        </div>
      `;
    }
    const checked = defaultValue === true || defaultValue === 'true' || defaultValue === 1;
    return `
      <div class="input-component input-checkbox-group" data-ui-type="checkbox-group">
        <label class="checkbox-single">
          <input type="checkbox" name="${escapeAttr(name)}" id="${escapeAttr(id)}" value="true" ${checked ? 'checked' : ''} ${ctx.required && field.required !== false ? 'required' : ''}>
          <span>${escapeHtml(field.label || name)}</span>
        </label>
      </div>
    `;
  }

  // --- SectionLabel: label, divider, heading (solo layout) ---
  function renderSectionLabel(field, ctx) {
    const kind = getUiType(field);
    const text = escapeHtml(field.label || field.text || field.heading || '');
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-section-label" data-ui-type="section-label"><div class="section-label-preview-stub">${kind}</div></div>`;
    }
    if (kind === 'divider') {
      return `<div class="input-component input-section-label input-section-label--divider" data-ui-type="section-label" role="separator"><hr></div>`;
    }
    const tag = kind === 'heading' ? 'h3' : 'div';
    return `<div class="input-component input-section-label input-section-label--${kind}" data-ui-type="section-label"><${tag} class="section-label-text">${text}</${tag}></div>`;
  }

  // --- StepWizard: stepper (contenedor; hijos lo rellena el caller) ---
  function renderStepWizard(field, ctx) {
    const steps = field.steps || field.children || [];
    const current = field.currentStep != null ? field.currentStep : 0;
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-step-wizard" data-ui-type="step-wizard"><div class="step-wizard-preview-stub"><i class="ph ph-steps"></i><span>Stepper (${steps.length || 0} pasos)</span></div></div>`;
    }
    const stepsHtml = steps.map((s, i) => {
      const label = typeof s === 'string' ? s : (s.label || s.title || 'Paso ' + (i + 1));
      const active = i === current ? ' active' : '';
      const done = i < current ? ' done' : '';
      return `<div class="step-wizard-step${active}${done}" data-step="${i}"><span class="step-wizard-dot"></span><span class="step-wizard-label">${escapeHtml(label)}</span></div>`;
    }).join('');
    return `
      <div class="input-component input-step-wizard" data-ui-type="step-wizard" data-current-step="${current}">
        <div class="step-wizard-track">${stepsHtml}</div>
        <div class="step-wizard-content" data-step-content></div>
      </div>
    `;
  }

  // --- TabContainer: tabs (contenedor) ---
  function renderTabContainer(field, ctx) {
    const tabs = field.tabs || field.children || [];
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-tab-container" data-ui-type="tab-container"><div class="tab-container-preview-stub"><i class="ph ph-squares-four"></i><span>Tabs (${tabs.length || 0})</span></div></div>`;
    }
    const tabButtons = tabs.map((t, i) => {
      const label = typeof t === 'string' ? t : (t.label || t.title || 'Tab ' + (i + 1));
      const active = i === 0 ? ' active' : '';
      return `<button type="button" class="tab-trigger${active}" data-tab="${i}">${escapeHtml(label)}</button>`;
    }).join('');
    const tabPanels = tabs.map((t, i) => {
      const content = typeof t === 'object' && t.content ? t.content : '';
      const hidden = i !== 0 ? ' hidden' : '';
      return `<div class="tab-panel${hidden}" data-tab-panel="${i}">${content}</div>`;
    }).join('');
    return `
      <div class="input-component input-tab-container" data-ui-type="tab-container">
        <div class="tab-container-head">${tabButtons}</div>
        <div class="tab-container-body">${tabPanels}</div>
      </div>
    `;
  }

  // --- InfoAlert: alert, info (bloque informativo) ---
  function renderInfoAlert(field, ctx) {
    const message = field.message || field.text || field.description || field.label || '';
    const variant = getUiType(field) === 'alert' ? 'alert' : 'info';
    const isPreview = ctx.mode === 'preview';
    if (isPreview) {
      return `<div class="input-component input-info-alert" data-ui-type="info-alert"><div class="info-alert-preview-stub">${variant}</div></div>`;
    }
    return `
      <div class="input-component input-info-alert input-info-alert--${variant}" data-ui-type="info-alert" role="status">
        <i class="ph ph-${variant === 'alert' ? 'warning' : 'info'}"></i>
        <div class="info-alert-message">${escapeHtml(message)}</div>
      </div>
    `;
  }

  // ---------- Legacy (fallback cuando ui_type no está en la biblioteca) ----------
  function renderLegacy(field, ctx) {
    const name = nameFor(field, ctx);
    const id = idFor(field, ctx);
    const type = getUiType(field);
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
    'base-input': renderBaseInput,
    'text-area': renderTextArea,
    'number-input': renderNumberInput,
    'tag-input': renderTagInput,
    'smart-select': renderSmartDropdown,
    'radio-group': renderRadioGroup,
    'checkbox-group': renderCheckboxGroup,
    'toggle-switch': function (field, ctx) {
      const f = { ...field, input_type: 'switch', type: 'switch' };
      return renderParameterControl(f, ctx);
    },
    'visual-grid': renderVisualGrid,
    'data-carousel': renderDataCarousel,
    'color-palette': renderColorPalette,
    'range-slider': function (field, ctx) {
      const f = { ...field, input_type: field.ui_type || field.input_type || 'slider', type: field.ui_type || field.input_type || 'slider' };
      return renderParameterControl(f, ctx);
    },
    'file-uploader': renderMediaUpload,
    'section-label': renderSectionLabel,
    'step-wizard': renderStepWizard,
    'tab-container': renderTabContainer,
    'info-alert': renderInfoAlert,
    // Aliases antiguos
    'smart-dropdown': renderSmartDropdown,
    'parameter-control': renderParameterControl,
    'media-upload': renderMediaUpload
  };

  /**
   * Renderiza un campo según su ui_type (biblioteca de componentes).
   * @param {Object} field - Definición del campo (ui_type, key, label, options, ...)
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
   * Envuelve el HTML del campo en label + help, salvo para layout o cuando el componente lleva su propia label.
   */
  function renderFieldWithWrapper(field, context) {
    const componentType = getComponentType(field);
    const isLayout = componentType && LAYOUT_OR_DECORATIVE.indexOf(componentType) >= 0;
    const hasOwnLabel = componentType === 'checkbox-group' && getUiType(field) !== 'checklist';
    const inner = renderField(field, context);
    if (isLayout) return inner;
    const label = field.label || field.key || field.name || 'Campo';
    const required = (context?.required !== false) && field.required;
    const help = field.description ? `<span class="field-help">${escapeHtml(field.description)}</span>` : '';
    const labelHtml = hasOwnLabel ? '' : `<label class="input-field-label">${escapeHtml(label)}${required ? ' <span class="required">*</span>' : ''}</label>`;
    return `
      <div class="input-field-wrap" data-field-key="${escapeAttr(field.key || field.name || '')}">
        ${labelHtml}
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

    // TagInput: Enter para añadir chip, sugerencias click, chip remove -> actualizar hidden
    root.querySelectorAll('.input-tag-input').forEach(wrap => {
      const hidden = wrap.querySelector('input[type="hidden"]');
      const chipsEl = wrap.querySelector('[data-chips]');
      const inputEl = wrap.querySelector('[data-tag-input]');
      if (!hidden || !chipsEl || !inputEl) return;
      const name = wrap.getAttribute('data-name');
      function getValues() {
        return (hidden.value || '').split(',').map(s => s.trim()).filter(Boolean);
      }
      function setValues(arr) {
        hidden.value = arr.join(',');
      }
      function addChip(value) {
        const v = String(value).trim();
        if (!v) return;
        const current = getValues();
        if (current.indexOf(v) >= 0) return;
        current.push(v);
        setValues(current);
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = v;
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'tag-chip-remove';
        rm.innerHTML = '×';
        rm.addEventListener('click', () => {
          const arr = getValues().filter(x => x !== v);
          setValues(arr);
          chip.remove();
        });
        chip.appendChild(rm);
        chipsEl.appendChild(chip);
        inputEl.value = '';
      }
      function renderChips() {
        chipsEl.innerHTML = '';
        getValues().forEach(v => {
          const chip = document.createElement('span');
          chip.className = 'tag-chip';
          chip.textContent = v;
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'tag-chip-remove';
          rm.innerHTML = '×';
          rm.addEventListener('click', () => {
            setValues(getValues().filter(x => x !== v));
            chip.remove();
          });
          chip.appendChild(rm);
          chipsEl.appendChild(chip);
        });
      }
      renderChips();
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addChip(this.value);
        }
      });
      wrap.querySelectorAll('.tag-suggestion').forEach(btn => {
        btn.addEventListener('click', function () {
          addChip(this.getAttribute('data-value'));
        });
      });
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

  /** Mapa documentado ui_type → componente (solo referencia) */
  const UI_TYPE_MAP = {
    'text': 'base-input', 'email': 'base-input', 'url': 'base-input', 'tel': 'base-input',
    'textarea': 'text-area', 'long-text': 'text-area',
    'number': 'number-input', 'integer': 'number-input', 'float': 'number-input',
    'tags': 'tag-input', 'multi-select': 'tag-input',
    'select': 'smart-select', 'smart-dropdown': 'smart-select', 'icon-select': 'smart-select',
    'radio': 'radio-group', 'segmented-control': 'radio-group',
    'checkbox': 'checkbox-group', 'checklist': 'checkbox-group',
    'switch': 'toggle-switch', 'boolean': 'toggle-switch',
    'visual-select': 'visual-grid', 'card-select': 'visual-grid',
    'smart-product-selector': 'data-carousel', 'smart-style-selector': 'data-carousel',
    'color-picker': 'color-palette',
    'slider': 'range-slider', 'slider-select': 'range-slider',
    'file-upload': 'file-uploader', 'image-import': 'file-uploader', 'audio-import': 'file-uploader', 'image-upload': 'file-uploader',
    'label': 'section-label', 'divider': 'section-label', 'heading': 'section-label',
    'stepper': 'step-wizard', 'tabs': 'tab-container', 'alert': 'info-alert', 'info': 'info-alert'
  };

  const InputRenders = {
    getUiType,
    getComponentType,
    renderField,
    renderFieldWithWrapper,
    initInputComponents,
    RENDERERS,
    UI_TYPE_MAP,
    LAYOUT_OR_DECORATIVE,
    escapeHtml,
    escapeAttr
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputRenders;
  } else {
    global.InputRenders = InputRenders;
  }
})(typeof window !== 'undefined' ? window : this);
