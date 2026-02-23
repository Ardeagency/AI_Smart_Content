/**
 * Input Registry - Arquitectura por contenedores (Render Container Registry).
 * El frontend solo conoce 8 contenedores; toda la variación es schema/config.
 * Regla: render(container_type, config) — nunca branch por input_type semántico.
 */
(function (global) {
  'use strict';

  var CONTAINER_TYPES = [
    'STRING_CONTAINER',
    'SELECT_CONTAINER',
    'MEDIA_CONTAINER',
    'BOOLEAN_CONTAINER',
    'NUMBER_CONTAINER',
    'RANGE_CONTAINER',
    'FILE_CONTAINER',
    'STRUCTURAL_CONTAINER'
  ];

  /** Mapeo: input_type (semántica) → contenedor de render. Todo lo demás es config. */
  var INPUT_TYPE_TO_CONTAINER = {
    string: 'STRING_CONTAINER',
    text: 'STRING_CONTAINER',
    textarea: 'STRING_CONTAINER',
    prompt_input: 'STRING_CONTAINER',
    prompt_user: 'STRING_CONTAINER',
    prompt_system: 'STRING_CONTAINER',
    tag_input: 'STRING_CONTAINER',
    tags: 'STRING_CONTAINER',
    slug_input: 'STRING_CONTAINER',
    code_input: 'STRING_CONTAINER',
    markdown: 'STRING_CONTAINER',
    labels: 'STRING_CONTAINER',
    instructions: 'STRING_CONTAINER',
    notes: 'STRING_CONTAINER',
    select: 'SELECT_CONTAINER',
    dropdown: 'SELECT_CONTAINER',
    multi_select: 'SELECT_CONTAINER',
    choice_chips: 'SELECT_CONTAINER',
    multi_select_chips: 'SELECT_CONTAINER',
    flags: 'SELECT_CONTAINER',
    colores: 'SELECT_CONTAINER',
    tone_selector: 'SELECT_CONTAINER',
    mood_selector: 'SELECT_CONTAINER',
    length_selector: 'SELECT_CONTAINER',
    brand_selector: 'SELECT_CONTAINER',
    entity_selector: 'SELECT_CONTAINER',
    audience_selector: 'SELECT_CONTAINER',
    campaign_selector: 'SELECT_CONTAINER',
    product_selector: 'SELECT_CONTAINER',
    image_selector: 'MEDIA_CONTAINER',
    gallery_picker: 'MEDIA_CONTAINER',
    visual_reference: 'MEDIA_CONTAINER',
    radio: 'BOOLEAN_CONTAINER',
    radio_buttons: 'BOOLEAN_CONTAINER',
    checkbox: 'BOOLEAN_CONTAINER',
    switch: 'BOOLEAN_CONTAINER',
    toggle_switch: 'BOOLEAN_CONTAINER',
    boolean: 'BOOLEAN_CONTAINER',
    toggle: 'BOOLEAN_CONTAINER',
    selection_checkboxes: 'BOOLEAN_CONTAINER',
    number: 'NUMBER_CONTAINER',
    stepper: 'NUMBER_CONTAINER',
    stepper_num: 'NUMBER_CONTAINER',
    num_stepper: 'NUMBER_CONTAINER',
    rating: 'NUMBER_CONTAINER',
    range: 'RANGE_CONTAINER',
    slider: 'RANGE_CONTAINER',
    file: 'FILE_CONTAINER',
    upload: 'FILE_CONTAINER',
    section: 'STRUCTURAL_CONTAINER',
    divider: 'STRUCTURAL_CONTAINER',
    heading: 'STRUCTURAL_CONTAINER',
    description: 'STRUCTURAL_CONTAINER',
    description_block: 'STRUCTURAL_CONTAINER',
    accordion: 'STRUCTURAL_CONTAINER',
    tabs: 'STRUCTURAL_CONTAINER',
    repeater: 'STRUCTURAL_CONTAINER',
    group: 'STRUCTURAL_CONTAINER'
  };

  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getInputType(field) {
    if (!field) return 'text';
    var ct = (field.container_type || '').toLowerCase();
    if (ct && ['section', 'divider', 'heading', 'description'].indexOf(ct) >= 0) return ct;
    var t = field.input_type || field.type || field.inputType || '';
    return (typeof t === 'string' && t.length) ? t.toLowerCase() : 'text';
  }

  /** Obtiene el contenedor de render para un campo. El frontend solo conoce contenedores. */
  function getContainerType(field) {
    var type = getInputType(field);
    return INPUT_TYPE_TO_CONTAINER[type] || 'STRING_CONTAINER';
  }

  function optVal(opt) {
    return opt && (opt.value !== undefined ? opt.value : opt);
  }
  function optLabel(opt) {
    return opt && (opt.label !== undefined ? opt.label : String(opt));
  }

  var INPUT_RENDERERS = {};

  function register(type, impl) {
    INPUT_RENDERERS[type] = impl;
  }

  // --- Preview (canvas del Builder: disabled, solo visual) ---
  function previewText(f) {
    var ph = escapeHtml(f.placeholder || '');
    return '<input type="text" class="preview-input" placeholder="' + ph + '" disabled>';
  }
  function previewTextarea(f) {
    var ph = escapeHtml(f.placeholder || '');
    var rows = f.rows || 3;
    return '<textarea class="preview-input" rows="' + rows + '" placeholder="' + ph + '" disabled></textarea>';
  }
  function previewSelect(f) {
    var opts = f.options || [];
    var ph = escapeHtml(f.placeholder || 'Seleccionar...');
    var list = opts.map(function (o) { return '<option>' + escapeHtml(optLabel(o)) + '</option>'; }).join('');
    var sel = '<select class="preview-input input-dropdown-select" disabled><option value="">' + ph + '</option>' + list + '</select>';
    return '<div class="input-dropdown-wrap">' + sel + '</div>';
  }
  function previewNumber(f) {
    var ph = escapeHtml(f.placeholder || '');
    return '<input type="number" class="preview-input" placeholder="' + ph + '" disabled>';
  }
  function previewCheckbox(f) {
    var lb = escapeHtml(f.label || 'Opción');
    return '<label class="preview-checkbox"><input type="checkbox" disabled><span>' + lb + '</span></label>';
  }
  function previewRadio(f) {
    var opts = f.options && f.options.length ? f.options : [{ label: 'Opción 1' }, { label: 'Opción 2' }];
    var name = 'preview_' + (f.key || 'r');
    return '<div class="preview-radio-group">' + opts.map(function (opt, i) {
      return '<label class="preview-radio"><input type="radio" name="' + name + '" disabled ' + (i === 0 ? 'checked' : '') + '><span>' + escapeHtml(optLabel(opt)) + '</span></label>';
    }).join('') + '</div>';
  }
  function previewRange(f) {
    var min = f.min != null ? f.min : 0;
    var max = f.max != null ? f.max : 100;
    var val = f.defaultValue != null ? f.defaultValue : 50;
    return '<div class="preview-range"><input type="range" min="' + min + '" max="' + max + '" value="' + val + '" disabled><span>' + val + '</span></div>';
  }
  function previewContext(label) {
    return '<select class="preview-input preview-context" disabled><option>[' + escapeHtml(label) + ']</option></select>';
  }
  function previewSwitch(f) {
    var lb = escapeHtml(f.label || '');
    return '<label class="preview-switch"><input type="checkbox" class="preview-input" disabled><span>' + lb + '</span></label>';
  }
  function previewBlock(label, icon) {
    return '<div class="preview-structural"><i class="ph ph-' + (icon || 'placeholder') + '"></i><span>' + escapeHtml(label) + '</span></div>';
  }
  /** Choice chips: pills single-select */
  function previewChoiceChips(f) {
    var opts = f.options && f.options.length ? f.options : [{ label: 'Opción 1' }, { label: 'Opción 2' }, { label: 'Opción 3' }];
    var items = opts.slice(0, 3).map(function (o, i) {
      return '<span class="preview-chip' + (i === 0 ? ' preview-chip--selected' : '') + '">' + escapeHtml(optLabel(o)) + '</span>';
    }).join('');
    return '<div class="preview-chips preview-chips--choice">' + items + '</div>';
  }
  /** Multi-select chips: pills with checkmarks */
  function previewMultiSelectChips(f) {
    var opts = f.options && f.options.length ? f.options : [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
    var items = opts.slice(0, 3).map(function (o, i) {
      return '<span class="preview-chip' + (i < 2 ? ' preview-chip--multi-selected' : '') + '"><i class="ph ph-check"></i>' + escapeHtml(optLabel(o)) + '</span>';
    }).join('');
    return '<div class="preview-chips preview-chips--multi">' + items + '</div>';
  }
  /** Tags: tokenized chips with remove */
  function previewTags(f) {
    var ph = escapeHtml(f.placeholder || 'Añade tags...');
    return '<div class="preview-tags"><span class="preview-tag">Keyword</span><span class="preview-tag">Keyword</span><input type="text" class="preview-input preview-tags-input" placeholder="' + ph + '" disabled></div>';
  }
  /** Stepper: number with up/down arrows */
  function previewStepper(f) {
    var val = f.defaultValue != null ? f.defaultValue : 0;
    var ph = escapeHtml(f.placeholder || '0');
    return '<div class="preview-stepper"><input type="number" class="preview-input preview-stepper-input" value="' + escapeHtml(String(val)) + '" placeholder="' + ph + '" disabled><div class="preview-stepper-btns"><button type="button" class="preview-stepper-btn" disabled><i class="ph ph-caret-up"></i></button><button type="button" class="preview-stepper-btn" disabled><i class="ph ph-caret-down"></i></button></div></div>';
  }
  /** Selection checkboxes: list of checkboxes (one per option) */
  function previewSelectionCheckboxes(f) {
    var opts = f.options && f.options.length ? f.options : [{ label: 'Opción 1' }, { label: 'Opción 2' }];
    var list = opts.map(function (o, i) {
      return '<label class="preview-checkbox"><input type="checkbox" disabled' + (i === 0 ? ' checked' : '') + '><span>' + escapeHtml(optLabel(o)) + '</span></label>';
    }).join('');
    return '<div class="preview-selection-checkboxes">' + list + '</div>';
  }
  /** Flags: mismo contenedor que dropdown; opciones según flag_category (idioma, país, etnia). */
  function getFlagsOptionsForField(f) {
    var category = (f.flag_category || f.flags_category || 'language').toLowerCase();
    var raw = [];
    if (typeof global.FlagsData !== 'undefined' && global.FlagsData.getFlagsOptionsByCategory && category !== 'custom') {
      raw = global.FlagsData.getFlagsOptionsByCategory(category);
    } else {
      raw = (f.options && f.options.length) ? f.options : [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }];
    }
    return raw.map(function (o) {
      var val = o.value !== undefined ? o.value : o;
      var name = (o.label !== undefined ? o.label : String(val));
      var flag = (o.flag !== undefined ? o.flag : (typeof global.FlagsData !== 'undefined' && global.FlagsData.countryCodeToFlag && String(val).length === 2 ? global.FlagsData.countryCodeToFlag(String(val)) : ''));
      return { value: val, label: (flag ? flag + ' ' : '') + name };
    });
  }
  function previewFlags(f) {
    var fWithOpts = Object.assign({}, f, { options: getFlagsOptionsForField(f) });
    return previewSelect(fWithOpts);
  }

  // ============================================================================
  // FORMATOS FIJOS DEL FRONTEND (LAS "CÁSCARAS" UNIVERSALES)
  // ============================================================================

  function formAttrs(f, opts) {
    var name = (opts.namePrefix || '') + (f.key || 'field');
    var id = (opts.idPrefix || '') + (f.key || 'field');
    var dis = opts.disabled ? ' disabled' : '';
    var req = (opts.required !== false && f.required) ? ' required' : '';
    return { name: name, id: id, disabled: dis, required: req };
  }

  /** 1. TEXT INPUT (texto una línea o textarea / prompt_input) */
  function renderTextInput(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || '');
    var isMulti = f.is_multiline || f.type === 'textarea' || f.type === 'prompt_input' || (f.input_type && (f.input_type === 'textarea' || f.input_type === 'prompt_input'));
    var isMonospace = f.monospace ? 'font-family: monospace;' : '';

    if (isMulti) {
    var rows = f.rows || 4;
      return '<textarea id="' + a.id + '" name="' + a.name + '" rows="' + rows + '" placeholder="' + ph + '" style="' + isMonospace + '" class="modern-input"' + a.disabled + a.required + '></textarea>';
    } else {
      var htmlType = f.html_type || 'text';
      return '<input type="' + htmlType + '" id="' + a.id + '" name="' + a.name + '" placeholder="' + ph + '" style="' + isMonospace + '" class="modern-input"' + a.disabled + a.required + '>';
    }
  }

  /** 2. NUMBER INPUT */
  function renderNumberInput(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || '');
    var min = f.min != null ? ' min="' + f.min + '"' : '';
    var max = f.max != null ? ' max="' + f.max + '"' : '';
    var step = f.step != null ? ' step="' + f.step + '"' : '';
    var val = f.defaultValue != null ? ' value="' + escapeHtml(String(f.defaultValue)) + '"' : '';
    return '<input type="number" class="modern-input" id="' + a.id + '" name="' + a.name + '" placeholder="' + ph + '"' + min + max + step + val + a.disabled + a.required + '>';
  }

  /** 3. SELECT DROPDOWN */
  function renderSelectDropdown(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || 'Seleccionar...');
    var optsList = f.options || [];
    var multiple = f.is_multiple ? ' multiple' : '';

    var optionsHtml = '<option value="" disabled selected>' + ph + '</option>' + optsList.map(function (o) {
      return '<option value="' + escapeHtml(String(optVal(o))) + '">' + escapeHtml(optLabel(o)) + '</option>';
    }).join('');

    var selectHtml = '<select class="modern-input input-dropdown-select" id="' + a.id + '" name="' + a.name + '"' + multiple + a.disabled + a.required + '>' + optionsHtml + '</select>';
    return '<div class="input-dropdown-wrap">' + selectHtml + '</div>';
  }

  /** 4. TOGGLE INPUT (Checkbox, Switch, Radio) */
  function renderToggleInput(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var displayStyle = f.display_style || 'checkbox';
    var lb = escapeHtml(f.label || f.key || 'Opción');
    var checked = f.defaultValue ? ' checked' : '';

    if (displayStyle === 'radio') {
      var optsList = f.options || [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
      var group = optsList.map(function (o, i) {
        return '<label class="modern-checkbox-wrapper"><input type="radio" name="' + a.name + '" value="' + escapeHtml(String(optVal(o))) + '"' + (i === 0 ? ' checked' : '') + a.disabled + '><div class="modern-checkbox-box" style="border-radius: 50%;"></div><span>' + escapeHtml(optLabel(o)) + '</span></label>';
      }).join('');
      return '<div class="radio-group" style="display:flex; flex-direction:column; gap:10px;">' + group + '</div>';
    }

    if (displayStyle === 'switch') {
      return '<label class="modern-switch-wrapper"><input type="checkbox" id="' + a.id + '" name="' + a.name + '"' + checked + a.disabled + '><div class="modern-switch-track"><div class="modern-switch-thumb"></div></div><span>' + lb + '</span></label>';
    }

    return '<label class="modern-checkbox-wrapper"><input type="checkbox" id="' + a.id + '" name="' + a.name + '"' + checked + a.disabled + '><div class="modern-checkbox-box"></div><span>' + lb + '</span></label>';
  }

  // --- Form (formulario real: delega a los formatos fijos) ---
  function isPreviewOpts(opts) {
    return opts && (opts.mode === 'preview' || opts.preview === true);
  }

  function formText(f, opts) {
    return renderTextInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formTextarea(f, opts) {
    return renderTextInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formSelect(f, opts) {
    return renderSelectDropdown(f, opts || {}, isPreviewOpts(opts));
  }
  function formNumber(f, opts) {
    return renderNumberInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formCheckbox(f, opts) {
    return renderToggleInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formRadio(f, opts) {
    var o = opts || {};
    var f2 = { display_style: 'radio', options: f.options, key: f.key, label: f.label, required: f.required };
    Object.keys(f).forEach(function (k) { if (f2[k] === undefined) f2[k] = f[k]; });
    return renderToggleInput(f2, o, isPreviewOpts(o));
  }
  function formRange(f, opts) {
    var a = formAttrs(f, opts || {});
    var min = f.min != null ? f.min : 0;
    var max = f.max != null ? f.max : 100;
    var step = f.step != null ? f.step : 1;
    var val = f.defaultValue != null ? f.defaultValue : 50;
    return '<div class="range-input"><input type="range" class="modern-input" id="' + a.id + '" name="' + a.name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"' + a.disabled + '><span class="range-value">' + val + '</span></div>';
  }
  /** Preview en canvas del Builder: bloque tipo acordeón para selectores de enfoque. */
  function previewFocusSelectorAccordion(f) {
    var t = f.context_selector_type || getInputType(f) || 'brand_selector';
    var label = getContextSelectorLabel(t);
    return (
      '<div class="preview-focus-selector">' +
        '<div class="preview-focus-selector-header">' +
          '<i class="ph ph-caret-down"></i>' +
          '<span>Selector de enfoque: ' + escapeHtml(label) + '</span>' +
          '<span class="preview-focus-selector-badge">Que la IA decida</span>' +
        '</div>' +
        '<div class="preview-focus-selector-hint">Personalizar enfoque desactivando el botón anterior</div>' +
      '</div>'
    );
  }

  function formContextPlaceholder(f, opts, label) {
    var a = formAttrs(f, opts || {});
    return '<input type="text" class="modern-input" id="' + a.id + '" name="' + a.name + '" placeholder="' + escapeHtml(label || 'ID o valor...') + '"' + a.disabled + a.required + '>';
  }

  /**
   * Selector de enfoque: acordeón con toggle "Que la IA decida" (por defecto activado).
   * Cuando está activado se envía TODOS los datos al webhook; cuando se desactiva el usuario
   * selecciona qué aspectos destacar (ej. solo descripción de marca). Un único contenedor por tipo:
   * brand, campaign, product, audience, entity. La vista (StudioView) rellena el acordeón con datos
   * de la organización y actualiza el hidden con el payload (completo o filtrado).
   */
  function formFocusSelectorAccordion(f, opts) {
    var a = formAttrs(f, opts || {});
    var focusType = f.context_selector_type || getInputType(f) || 'brand_selector';
    var label = getContextSelectorLabel(focusType);
    return (
      '<div class="focus-selector-accordion" data-focus-type="' + escapeHtml(focusType) + '" data-field-name="' + escapeHtml(a.name) + '">' +
        '<div class="focus-selector-toggle-wrap">' +
          '<label class="focus-selector-ai-toggle">' +
            '<input type="checkbox" class="focus-selector-let-ai-decide" checked aria-label="Que la IA decida">' +
            '<span class="focus-selector-ai-label">Que la IA decida</span>' +
          '</label>' +
          '<p class="focus-selector-ai-help">Cuando está activado se envían todos los datos al webhook. Desactívalo para elegir en qué quieres enfocar la producción.</p>' +
        '</div>' +
        '<div class="focus-selector-body" aria-hidden="true">' +
          '<div class="focus-selector-accordion-inner">' +
            '<p class="focus-selector-empty-msg">Cargando datos de ' + escapeHtml(label) + '…</p>' +
          '</div>' +
        '</div>' +
        '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value=""' + a.disabled + a.required + '>' +
      '</div>'
    );
  }
  function formSwitch(f, opts) {
    var f2 = { display_style: 'switch', label: f.label, key: f.key, defaultValue: f.defaultValue, required: f.required };
    Object.keys(f).forEach(function (k) { if (f2[k] === undefined) f2[k] = f[k]; });
    return renderToggleInput(f2, opts || {}, isPreviewOpts(opts));
  }
  /** Renderiza bloque estructural en formulario consumidor: section, divider, heading, description */
  function formStructural(f) {
    var t = getInputType(f);
    var title = escapeHtml(f.title || f.label || '');
    var sectionDesc = escapeHtml(f.section_description || f.description || '');
    var text = escapeHtml(f.text || f.label || '');
    var level = Math.min(6, Math.max(1, parseInt(f.level, 10) || 2));
    var alignment = (f.alignment || 'left').toLowerCase();
    var alignClass = alignment !== 'left' ? ' structural-align-' + alignment : '';
    if (t === 'section') {
      var collapsible = f.collapsible ? ' structural-section-collapsible' : '';
      return '<div class="form-structural form-section' + collapsible + alignClass + '" data-key="' + escapeHtml(f.key || '') + '">' +
        (title ? '<div class="form-section-header"><span class="form-section-title">' + title + '</span></div>' : '') +
        (sectionDesc ? '<p class="form-section-description">' + sectionDesc + '</p>' : '') +
        '</div>';
    }
    if (t === 'divider') {
      var spacing = (f.spacing || 'medium').toLowerCase();
      return '<hr class="form-structural form-divider form-divider-' + spacing + '" data-key="' + escapeHtml(f.key || '') + '">';
    }
    if (t === 'heading') {
      return '<h' + level + ' class="form-structural form-heading' + alignClass + '" data-key="' + escapeHtml(f.key || '') + '">' + (text || 'Título') + '</h' + level + '>';
    }
    if (t === 'description') {
      return '<p class="form-structural form-description' + alignClass + '" data-key="' + escapeHtml(f.key || '') + '">' + (text || '') + '</p>';
    }
    return '';
  }

  /** Choice chips (single): pill buttons, one selected */
  function renderChoiceChips(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var optsList = f.options || [];
    var name = a.name;
    var idBase = a.id;
    var html = optsList.map(function (o, i) {
      var v = escapeHtml(String(optVal(o)));
      var lbl = escapeHtml(optLabel(o));
      var checked = (f.defaultValue === optVal(o) || (f.defaultValue == null && i === 0)) ? ' checked' : '';
      return '<label class="input-choice-chip"><input type="radio" name="' + name + '" value="' + v + '"' + checked + a.disabled + '><span class="input-choice-chip-label">' + lbl + '</span></label>';
    }).join('');
    return '<div class="input-chips-wrap input-chips-wrap--choice" role="group">' + html + '</div>';
  }

  /** Multi-select chips: pills with checkboxes */
  function renderMultiSelectChips(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var optsList = f.options || [];
    var name = a.name + '[]';
    var defVal = Array.isArray(f.defaultValue) ? f.defaultValue : (f.defaultValue != null ? [f.defaultValue] : []);
    var html = optsList.map(function (o) {
      var v = optVal(o);
      var vs = String(v);
      var lbl = escapeHtml(optLabel(o));
      var checked = defVal.indexOf(v) >= 0 || defVal.indexOf(vs) >= 0 ? ' checked' : '';
      return '<label class="input-multi-chip"><input type="checkbox" name="' + name + '" value="' + escapeHtml(vs) + '"' + checked + a.disabled + '><i class="ph ph-check input-multi-chip-check"></i><span>' + lbl + '</span></label>';
    }).join('');
    return '<div class="input-chips-wrap input-chips-wrap--multi" role="group">' + html + '</div>';
  }

  /** Tags: input + list of removable chips (value = array of strings). JS must handle add/remove; aquí solo marcamos contenedor. */
  function renderTagsInput(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || 'Añade tags...');
    var existing = Array.isArray(f.defaultValue) ? f.defaultValue : [];
    var tagsHtml = existing.map(function (tag) {
      return '<span class="input-tag"><span class="input-tag-text">' + escapeHtml(String(tag)) + '</span><button type="button" class="input-tag-remove" aria-label="Quitar"><i class="ph ph-x"></i></button></span>';
    }).join('');
    return '<div class="input-tags-wrap" data-name="' + escapeHtml(a.name) + '"><div class="input-tags-list">' + tagsHtml + '</div><input type="text" class="modern-input input-tags-input" placeholder="' + ph + '" data-tags-input' + a.disabled + '></div>';
  }

  /** Stepper: number input with up/down buttons */
  function renderStepperInput(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var min = f.min != null ? f.min : '';
    var max = f.max != null ? f.max : '';
    var step = f.step != null ? f.step : 1;
    var val = f.defaultValue != null ? f.defaultValue : '';
    var unit = escapeHtml(f.unit || '');
    return '<div class="input-stepper-wrap"><input type="number" class="modern-input input-stepper-input" id="' + a.id + '" name="' + a.name + '" value="' + escapeHtml(String(val)) + '" min="' + min + '" max="' + max + '" step="' + step + '"' + a.disabled + a.required + '><div class="input-stepper-btns"><button type="button" class="input-stepper-btn" data-dir="up" tabindex="-1"' + a.disabled + '><i class="ph ph-caret-up"></i></button><button type="button" class="input-stepper-btn" data-dir="down" tabindex="-1"' + a.disabled + '><i class="ph ph-caret-down"></i></button></div>' + (unit ? '<span class="input-stepper-unit">' + unit + '</span>' : '') + '</div>';
  }

  /** Selection checkboxes: one checkbox per option (multi boolean) */
  function renderSelectionCheckboxes(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var optsList = f.options || [];
    var defVal = Array.isArray(f.defaultValue) ? f.defaultValue : (f.defaultValue != null ? [f.defaultValue] : []);
    var html = optsList.map(function (o, i) {
      var v = optVal(o);
      var vs = String(v);
      var lbl = escapeHtml(optLabel(o));
      var checked = defVal.indexOf(v) >= 0 || defVal.indexOf(vs) >= 0 ? ' checked' : '';
      return '<label class="modern-checkbox-wrapper input-selection-checkbox"><input type="checkbox" name="' + a.name + '[]" value="' + escapeHtml(vs) + '"' + checked + a.disabled + '><div class="modern-checkbox-box"></div><span>' + lbl + '</span></label>';
    }).join('');
    return '<div class="input-selection-checkboxes">' + html + '</div>';
  }

  function formChoiceChips(f, opts) {
    return renderChoiceChips(f, opts || {}, isPreviewOpts(opts));
  }
  function formMultiSelectChips(f, opts) {
    return renderMultiSelectChips(f, opts || {}, isPreviewOpts(opts));
  }
  function formTags(f, opts) {
    return renderTagsInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formStepper(f, opts) {
    return renderStepperInput(f, opts || {}, isPreviewOpts(opts));
  }
  function formSelectionCheckboxes(f, opts) {
    return renderSelectionCheckboxes(f, opts || {}, isPreviewOpts(opts));
  }
  function formFlags(f, opts) {
    var fWithOpts = Object.assign({}, f, { options: getFlagsOptionsForField(f) });
    return renderSelectDropdown(fWithOpts, opts || {}, isPreviewOpts(opts));
  }

  /** Paleta por defecto para contenedor colores (círculos seleccionables, max 6). */
  var DEFAULT_COLOR_PALETTE = [
    { value: '#000000', label: 'Negro' }, { value: '#ffffff', label: 'Blanco' }, { value: '#ef4444', label: 'Rojo' },
    { value: '#f97316', label: 'Naranja' }, { value: '#eab308', label: 'Amarillo' }, { value: '#22c55e', label: 'Verde' },
    { value: '#06b6d4', label: 'Cian' }, { value: '#3b82f6', label: 'Azul' }, { value: '#8b5cf6', label: 'Violeta' },
    { value: '#ec4899', label: 'Rosa' }, { value: '#78716c', label: 'Marrón' }, { value: '#64748b', label: 'Gris' }
  ];
  function getColorsOptionsForField(f) {
    var opts = f.options && f.options.length ? f.options : DEFAULT_COLOR_PALETTE;
    return opts.map(function (o) {
      var val = (o.value != null ? o.value : o).toString().trim();
      if (val && val.indexOf('#') !== 0) val = '#' + val;
      return { value: val || '#000000', label: o.label != null ? o.label : val };
    });
  }
  function previewColores(f) {
    var opts = getColorsOptionsForField(f);
    var maxShow = 10;
    var slice = opts.slice(0, maxShow);
    var html = slice.map(function (o) {
      var hex = escapeHtml((o.value || '#000000').toString());
      return '<span class="input-color-swatch" style="background:' + hex + ';" title="' + escapeHtml(o.label || o.value || '') + '" aria-hidden="true"></span>';
    }).join('');
    return '<div class="input-colors-wrap input-colors-wrap--preview">' + html + '</div>';
  }
  function formColores(f, opts) {
    opts = opts || {};
    var a = formAttrs(f, opts);
    var isPreview = isPreviewOpts(opts);
    var optsList = getColorsOptionsForField(f);
    var maxSel = Math.max(1, Math.min(12, f.max_selections != null ? f.max_selections : 6));
    var selected = f.defaultValue != null
      ? (Array.isArray(f.defaultValue) ? f.defaultValue : String(f.defaultValue).split(',').map(function (s) { return s.trim(); }).filter(Boolean))
      : [];
    var selectedStr = selected.slice(0, maxSel).join(',');
    if (isPreview) {
      var previewHtml = optsList.slice(0, 8).map(function (o) {
        var hex = escapeHtml((o.value || '#000000').toString());
        return '<span class="input-color-swatch" style="background:' + hex + ';"></span>';
      }).join('');
      return '<div class="input-colors-wrap input-colors-wrap--preview">' + previewHtml + '</div>';
    }
    var swatches = optsList.map(function (o) {
      var hex = (o.value || '#000000').toString();
      var valEsc = escapeHtml(hex);
      var isSel = selected.indexOf(hex) >= 0;
      return '<button type="button" class="input-color-swatch' + (isSel ? ' selected' : '') + '" data-value="' + valEsc + '" style="background:' + valEsc + ';" title="' + escapeHtml(o.label || hex) + '" aria-pressed="' + (isSel ? 'true' : 'false') + '"></button>';
    }).join('');
    return '<input type="hidden" class="input-colors-value" name="' + escapeHtml(a.name) + '" id="' + escapeHtml(a.id) + '" value="' + escapeHtml(selectedStr) + '" data-max="' + maxSel + '">' +
      '<div class="input-colors-wrap" data-colors-key="' + escapeHtml(f.key || '') + '" data-colors-max="' + maxSel + '" role="group" aria-label="' + escapeHtml(f.label || 'Colores') + '">' + swatches + '</div>';
  }

  /** Placeholder para FILE_CONTAINER (upload) */
  function previewFile(f) {
    return '<div class="preview-structural"><i class="ph ph-upload-simple"></i><span>' + escapeHtml(f.label || 'Subir archivo') + '</span></div>';
  }
  function formFile(f, opts) {
    var a = formAttrs(f, opts || {});
    var accept = (f.fileTypes || f.accept || '').trim() || '*';
    return '<input type="file" class="modern-input" id="' + a.id + '" name="' + a.name + '" accept="' + escapeHtml(accept) + '"' + (f.multiUpload ? ' multiple' : '') + a.disabled + '>';
  }

  /** Etiqueta para selectores de contexto (brand, entity, audience, etc.) */
  function getContextSelectorLabel(inputType) {
    var labels = {
      brand_selector: 'Selector de Marca',
      entity_selector: 'Selector de Entidad',
      audience_selector: 'Selector de Audiencia',
      campaign_selector: 'Selector de Campaña',
      product_selector: 'Selector de Producto',
      image_selector: 'Selector de Imagen',
      gallery_picker: 'Galería',
      visual_reference: 'Referencia visual'
    };
    return labels[inputType] || 'Selector';
  }
  function getContextPlaceholder(inputType) {
    var placeholders = {
      brand_selector: 'UUID de marca...',
      entity_selector: 'UUID de entidad...',
      audience_selector: 'UUID de audiencia...',
      campaign_selector: 'UUID de campaña...',
      product_selector: 'UUID de producto...',
      image_selector: 'URL o ID de imagen...',
      gallery_picker: 'IDs separados por coma...',
      visual_reference: 'URL o ID...'
    };
    return placeholders[inputType] || 'ID o valor...';
  }
  /** Etiqueta y placeholder para selector de imagen según función (media_source) */
  function getMediaSourceLabel(mediaSource) {
    var labels = {
      products: 'Selector de Productos',
      entities: 'Selector de Entidades',
      references: 'Selector de Referencias',
      visual_reference: 'Referencia visual',
      brand: 'Selector de Marca',
      audience: 'Selector de Audiencia',
      campaign: 'Selector de Campaña',
      other: 'Selector de imagen'
    };
    return labels[mediaSource] || 'Selector de imagen';
  }
  function getMediaSourcePlaceholder(mediaSource) {
    var placeholders = {
      products: 'Selecciona producto(s)...',
      entities: 'Selecciona entidad(es)...',
      references: 'Selecciona referencia(s)...',
      visual_reference: 'URL o referencia...',
      brand: 'Selecciona marca...',
      audience: 'Selecciona audiencia...',
      campaign: 'Selecciona campaña...',
      other: 'URL o ID de imagen...'
    };
    return placeholders[mediaSource] || 'ID o valor...';
  }

  /** Preview: carrusel horizontal para image_selector (canvas del Builder) */
  function previewImageSelectorCarousel(f) {
    var source = f.media_source || f.function_type || 'other';
    var labels = {
      products: 'Imagen principal por producto',
      entities: 'Imagen por entidad',
      references: 'Imágenes de referencia (con filtro)',
      visual_reference: 'Referencia visual',
      brand: 'Imagen de marca',
      audience: 'Imagen de audiencia',
      campaign: 'Imagen de campaña',
      other: 'Selección de imagen'
    };
    var title = labels[source] || labels.other;
    var multi = f.image_selection_mode === 'multiple' || f.selection_mode === 'multiple';
    var count = 4;
    var cards = [];
    for (var i = 0; i < count; i++) {
      cards.push('<div class="image-selector-card image-selector-card--preview"><div class="image-selector-card-placeholder"><i class="ph ph-image"></i></div><span class="image-selector-card-label">' + (source === 'products' ? 'Producto ' + (i + 1) : (source === 'references' ? 'Ref. ' + (i + 1) : 'Imagen')) + '</span></div>');
    }
    return '<div class="image-selector-carousel image-selector-carousel--preview" data-media-source="' + escapeHtml(source) + '" data-selection-mode="' + (multi ? 'multiple' : 'single') + '"><div class="image-selector-carousel-label">' + escapeHtml(title) + '</div><div class="image-selector-carousel-track">' + cards.join('') + '</div></div>';
  }

  /** Form: carrusel horizontal para image_selector (formulario consumidor).
   * El valor seleccionado se guarda en un hidden: single = id del producto, multiple = JSON array de ids.
   * La vista (StudioView) debe poblar el track con productos/referencias y actualizar este input al seleccionar. */
  function formImageSelectorCarousel(f, opts) {
    var a = formAttrs(f, opts || {});
    var source = f.media_source || f.function_type || 'other';
    var multi = f.image_selection_mode === 'multiple' || f.selection_mode === 'multiple';
    var placeholderLabel = getMediaSourceLabel(source);
    return '<div class="image-selector-carousel" data-media-source="' + escapeHtml(source) + '" data-selection-mode="' + (multi ? 'multiple' : 'single') + '" data-key="' + escapeHtml(f.key || '') + '" data-field-name="' + escapeHtml(a.name) + '">' +
      '<div class="image-selector-carousel-track image-selector-carousel-track--empty" data-empty-msg="' + escapeHtml(placeholderLabel) + '"></div>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value=""' + a.disabled + a.required + '>' +
      '</div>';
  }

  /** Registry de los 8 contenedores. El frontend solo conoce estos. */
  var CONTAINER_RENDERERS = {
    STRING_CONTAINER: {
      preview: function (f) {
        var it = getInputType(f);
        if (it === 'tags') return previewTags(f);
        var multi = f.mode === 'multi_line' || f.mode === 'multiline' || f.mode === 'prompt' || f.is_multiline ||
          (f.input_type && (f.input_type === 'string' && (f.mode === 'multiline' || f.mode === 'multi_line' || f.mode === 'prompt') || f.input_type === 'textarea' || f.input_type === 'prompt_input' || f.input_type === 'prompt_user' || f.input_type === 'prompt_system'));
        return multi ? previewTextarea(f) : previewText(f);
      },
      form: function (f, opts) {
        opts = opts || {};
        if (getInputType(f) === 'tags') return formTags(f, opts);
        var multi = f.mode === 'multi_line' || f.mode === 'multiline' || f.mode === 'prompt' || f.is_multiline ||
          (f.input_type && (f.input_type === 'string' && (f.mode === 'multiline' || f.mode === 'multi_line' || f.mode === 'prompt') || f.input_type === 'textarea' || f.input_type === 'prompt_input' || f.input_type === 'prompt_user' || f.input_type === 'prompt_system'));
        return multi ? formTextarea(f, opts) : formText(f, opts);
      }
    },
    SELECT_CONTAINER: {
      preview: function (f) {
        var t = f.context_selector_type || getInputType(f);
        var isContext = ['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector'].indexOf(getInputType(f)) >= 0 || !!f.context_selector_type;
        if (isContext) return previewFocusSelectorAccordion(f);
        if (t === 'flags') return previewFlags(f);
        if (t === 'colores') return previewColores(f);
        var style = f.select_style || (t === 'choice_chips' ? 'choice_chips' : (t === 'multi_select_chips' ? 'multi_select_chips' : 'dropdown'));
        if (style === 'choice_chips') return previewChoiceChips(f);
        if (style === 'multi_select_chips' || f.is_multiple) return previewMultiSelectChips(f);
        return previewSelect(f);
      },
      form: function (f, opts) {
        var t = f.context_selector_type || getInputType(f);
        var isContext = ['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector'].indexOf(getInputType(f)) >= 0 || !!f.context_selector_type;
        if (isContext) return formFocusSelectorAccordion(f, opts || {});
        if (t === 'flags') return formFlags(f, opts);
        if (t === 'colores') return formColores(f, opts);
        var style = f.select_style || (t === 'choice_chips' ? 'choice_chips' : (t === 'multi_select_chips' ? 'multi_select_chips' : 'dropdown'));
        if (style === 'choice_chips') return formChoiceChips(f, opts);
        if (style === 'multi_select_chips' || f.is_multiple) return formMultiSelectChips(f, opts);
        return formSelect(f, opts);
      }
    },
    MEDIA_CONTAINER: {
      preview: function (f) {
        var it = getInputType(f);
        if (it === 'image_selector' || it === 'gallery_picker') return previewImageSelectorCarousel(f);
        var label = f.media_source ? getMediaSourceLabel(f.media_source) : getContextSelectorLabel(it);
        return previewContext(label);
      },
      form: function (f, opts) {
        var it = getInputType(f);
        if (it === 'image_selector' || it === 'gallery_picker') return formImageSelectorCarousel(f, opts);
        var placeholder = f.media_source ? getMediaSourcePlaceholder(f.media_source) : getContextPlaceholder(it);
        return formContextPlaceholder(f, opts || {}, placeholder);
      }
    },
    BOOLEAN_CONTAINER: {
      preview: function (f) {
        var display = (f.display_style || f.display || getInputType(f) || 'checkbox');
        if (display === 'radio' || display === 'radio_buttons') return previewRadio(f);
        if (display === 'switch' || display === 'toggle_switch') return previewSwitch(f);
        if (display === 'selection_checkboxes') return previewSelectionCheckboxes(f);
        return previewCheckbox(f);
      },
      form: function (f, opts) {
        var display = (f.display_style || f.display || getInputType(f) || 'checkbox');
        if (display === 'radio' || display === 'radio_buttons') return formRadio(f, opts);
        if (display === 'switch' || display === 'toggle_switch') return formSwitch(f, opts);
        if (display === 'selection_checkboxes') return formSelectionCheckboxes(f, opts);
        return formCheckbox(f, opts);
      }
    },
    NUMBER_CONTAINER: {
      preview: function (f) {
        var it = getInputType(f);
        if (it === 'stepper_num' || it === 'stepper' || f.display_style === 'stepper') return previewStepper(f);
        return previewNumber(f);
      },
      form: function (f, opts) {
        var it = getInputType(f);
        if (it === 'stepper_num' || it === 'stepper' || f.display_style === 'stepper') return formStepper(f, opts);
        return formNumber(f, opts);
      }
    },
    RANGE_CONTAINER: {
      preview: previewRange,
      form: formRange
    },
    FILE_CONTAINER: {
      preview: previewFile,
      form: formFile
    },
    STRUCTURAL_CONTAINER: {
      preview: function (f) {
        var t = getInputType(f);
        var labels = { section: 'Sección', divider: 'Divisor', heading: 'Título', description: 'Texto informativo', description_block: 'Texto informativo', accordion: 'Acordeón', tabs: 'Pestañas', repeater: 'Repetidor', group: 'Grupo' };
        var icons = { section: 'square', divider: 'minus', heading: 'type', description: 'align-left', description_block: 'info', accordion: 'caret-double-down', tabs: 'squares-four', repeater: 'repeat', group: 'stack' };
        return previewBlock(labels[t] || f.label || 'Bloque', icons[t] || 'placeholder');
      },
      form: formStructural
    }
  };

  // Registrar todos los tipos (compatibilidad: delegan en contenedores)
  function registerAll() {
    register('text', { preview: previewText, form: formText });
    register('textarea', { preview: previewTextarea, form: formTextarea });
    register('select', { preview: previewSelect, form: formSelect });
    register('number', { preview: previewNumber, form: formNumber });
    register('checkbox', { preview: previewCheckbox, form: formCheckbox });
    register('radio', { preview: previewRadio, form: formRadio });
    register('range', { preview: previewRange, form: formRange });
    register('boolean', { preview: previewSwitch, form: formSwitch });
    register('switch', { preview: previewSwitch, form: formSwitch });

    register('prompt_input', { preview: previewTextarea, form: formTextarea });
    register('tag_input', { preview: previewText, form: formText });
    register('slug_input', { preview: previewText, form: formText });

    register('tone_selector', { preview: previewSelect, form: formSelect });
    register('mood_selector', { preview: previewSelect, form: formSelect });
    register('length_selector', { preview: previewSelect, form: formSelect });

    register('brand_selector', { preview: function () { return previewContext('Selector de Marca'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de marca...'); } });
    register('entity_selector', { preview: function () { return previewContext('Selector de Entidad'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de entidad...'); } });
    register('audience_selector', { preview: function () { return previewContext('Selector de Audiencia'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de audiencia...'); } });
    register('campaign_selector', { preview: function () { return previewContext('Selector de Campaña'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de campaña...'); } });

    register('image_selector', { preview: previewImageSelectorCarousel, form: formImageSelectorCarousel });
    register('gallery_picker', { preview: function () { return previewContext('Galería'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'IDs separados por coma...'); } });
    register('product_selector', { preview: function () { return previewContext('Selector de Producto'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de producto...'); } });

    register('multi_select', { preview: previewSelect, form: formSelect });
    register('dropdown', { preview: previewSelect, form: formSelect });
    register('choice_chips', { preview: previewChoiceChips, form: formChoiceChips });
    register('multi_select_chips', { preview: previewMultiSelectChips, form: formMultiSelectChips });
    register('flags', { preview: previewFlags, form: formFlags });
    register('colores', { preview: previewColores, form: formColores });
    register('tags', { preview: previewTags, form: formTags });
    register('stepper_num', { preview: previewStepper, form: formStepper });
    register('num_stepper', { preview: previewStepper, form: formStepper });
    register('selection_checkboxes', { preview: previewSelectionCheckboxes, form: formSelectionCheckboxes });
    register('toggle_switch', { preview: previewSwitch, form: formSwitch });
    register('slider', { preview: previewRange, form: formRange });

    register('section', { preview: function () { return previewBlock('Sección', 'square'); }, form: formStructural });
    register('divider', { preview: function () { return previewBlock('Divisor', 'minus'); }, form: formStructural });
    register('heading', { preview: function () { return previewBlock('Título', 'type'); }, form: formStructural });
    register('description', { preview: function () { return previewBlock('Texto informativo', 'align-left'); }, form: formStructural });
    register('description_block', { preview: function () { return previewBlock('Texto informativo', 'info'); }, form: formStructural });
  }
  registerAll();

  /** Devuelve el renderer del contenedor asociado al tipo (compatibilidad). */
  function getRenderer(type) {
    var container = INPUT_TYPE_TO_CONTAINER[typeof type === 'string' ? type.toLowerCase() : ''] || 'STRING_CONTAINER';
    return CONTAINER_RENDERERS[container] || CONTAINER_RENDERERS.STRING_CONTAINER;
  }

  /**
   * Renderiza el preview del campo (canvas del Builder).
   * Dispatch por contenedor: el frontend solo conoce contenedores, no input_type.
   * @param {Object} field - Campo con key, label, input_type, placeholder, options, etc.
   * @returns {string} HTML
   */
  function renderPreview(field) {
    var container = getContainerType(field);
    var r = CONTAINER_RENDERERS[container];
    if (!r || !r.preview) return previewText(field);
    return r.preview(field);
  }

  /**
   * Renderiza el campo para formulario (Studio, Test, Preview).
   * Dispatch por contenedor.
   * @param {Object} field - Campo con key, label, input_type, required, etc.
   * @param {Object} opts - { mode: 'preview'|'test'|'studio', idPrefix, namePrefix, disabled, required }
   * @returns {string} HTML del input (sin wrapper label/helper).
   */
  function renderFormField(field, opts) {
    opts = opts || {};
    var container = getContainerType(field);
    var r = CONTAINER_RENDERERS[container];
    if (!r || !r.form) return formText(field, opts);
    return r.form(field, opts);
  }

  /**
   * Plantillas por defecto para el Builder cuando no hay BD.
   * Cada una tiene id, name, description, category, icon_name, base_schema.
   */
  /**
   * Plantillas canónicas: una por familia (la más configurable). Sin duplicados text/textarea, select/dropdown, number/stepper, checkbox/switch, etc.
   * Los input_type antiguos (text, textarea, prompt_input, etc.) siguen mapeados en INPUT_TYPE_TO_CONTAINER para flujos existentes.
   */
  function getDefaultTemplates() {
    return [
      { id: 'string', name: 'Texto (String)', description: 'Campo de texto: una línea, multilínea o prompt (modo configurable)', category: 'basic', icon_name: 'textbox', base_schema: { input_type: 'string', type: 'string', data_type: 'string', mode: 'single_line', placeholder: '', maxLength: 255, rows: 4 } },
      { id: 'dropdown', name: 'Lista desplegable', description: 'Selección única con opciones configurables', category: 'basic', icon_name: 'caret-down', base_schema: { input_type: 'dropdown', type: 'dropdown', data_type: 'string', select_style: 'dropdown', options: [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }] } },
      { id: 'choice_chips', name: 'Choice Chips', description: 'Opciones en pastillas (selección única)', category: 'basic', icon_name: 'squares-four', base_schema: { input_type: 'choice_chips', type: 'choice_chips', data_type: 'string', select_style: 'choice_chips', options: [{ value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }, { value: 'c', label: 'Opción C' }] } },
      { id: 'multi_select_chips', name: 'Multi-select Chips', description: 'Pastillas con múltiple selección', category: 'basic', icon_name: 'check-square', base_schema: { input_type: 'multi_select_chips', type: 'multi_select_chips', data_type: 'array', select_style: 'multi_select_chips', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }] } },
      { id: 'radio', name: 'Radio', description: 'Opciones mutuamente excluyentes', category: 'basic', icon_name: 'radio-button', base_schema: { input_type: 'radio', type: 'radio', data_type: 'string', options: [] } },
      { id: 'selection_checkboxes', name: 'Selection Checkboxes', description: 'Lista de casillas por opción (selección múltiple)', category: 'basic', icon_name: 'list-checks', base_schema: { input_type: 'selection_checkboxes', type: 'selection_checkboxes', data_type: 'array', display_style: 'selection_checkboxes', options: [{ value: '1', label: 'Opción 1' }, { value: '2', label: 'Opción 2' }] } },
      { id: 'num_stepper', name: 'Número (Stepper)', description: 'Número con min/max/step/unit y botones +/-', category: 'controls', icon_name: 'caret-up-down', base_schema: { input_type: 'num_stepper', type: 'num_stepper', data_type: 'number', min: 0, max: 999, step: 1, defaultValue: 0, unit: '' } },
      { id: 'range', name: 'Slider', description: 'Control deslizante (rango)', category: 'controls', icon_name: 'sliders', base_schema: { input_type: 'range', type: 'range', data_type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 } },
      { id: 'toggle_switch', name: 'Toggle / Boolean', description: 'Interruptor on/off configurable', category: 'controls', icon_name: 'toggle-right', base_schema: { input_type: 'toggle_switch', type: 'toggle_switch', data_type: 'boolean', display_style: 'switch', defaultValue: false } },
      { id: 'tags', name: 'Tags', description: 'Etiquetas añadibles/eliminables', category: 'basic', icon_name: 'tag', base_schema: { input_type: 'tags', type: 'tags', data_type: 'array', placeholder: 'Añade tags...', defaultValue: [] } },
      { id: 'flags', name: 'Flags', description: 'Dropdown preconfigurado: idioma, país o etnia/origen (flag_category).', category: 'basic', icon_name: 'flag', base_schema: { input_type: 'flags', type: 'flags', data_type: 'string', flag_category: 'language', options: [] } },
      { id: 'colores', name: 'Colores', description: 'Círculos de colores seleccionables (como brands). Máx. 6. El desarrollador define la paleta.', category: 'basic', icon_name: 'palette', base_schema: { input_type: 'colores', type: 'colores', data_type: 'array', max_selections: 6, options: [{ value: '#000000', label: 'Negro' }, { value: '#ef4444', label: 'Rojo' }, { value: '#22c55e', label: 'Verde' }, { value: '#3b82f6', label: 'Azul' }, { value: '#eab308', label: 'Amarillo' }, { value: '#8b5cf6', label: 'Violeta' }] } },
      { id: 'brand_selector', name: 'Selector de Marca', description: 'Enfoque de producción: marca (acordeón)', category: 'brand', icon_name: 'storefront', base_schema: { input_type: 'brand_selector', type: 'brand_selector', data_type: 'object' } },
      { id: 'entity_selector', name: 'Selector de Entidad', description: 'Producto/servicio/lugar', category: 'brand', icon_name: 'package', base_schema: { input_type: 'entity_selector', type: 'entity_selector', data_type: 'object', entityTypes: ['product', 'service'] } },
      { id: 'audience_selector', name: 'Selector de Audiencia', description: 'Enfoque: audiencia', category: 'brand', icon_name: 'users', base_schema: { input_type: 'audience_selector', type: 'audience_selector', data_type: 'object' } },
      { id: 'product_selector', name: 'Selector de Producto', description: 'Enfoque: producto', category: 'brand', icon_name: 'shopping-bag', base_schema: { input_type: 'product_selector', type: 'product_selector', data_type: 'object' } },
      { id: 'image_selector', name: 'Selector de Imagen', description: 'Carrusel de imágenes (productos/referencias)', category: 'media', icon_name: 'image', base_schema: { input_type: 'image_selector', type: 'image_selector', data_type: 'object' } },
      { id: 'tone_selector', name: 'Tono de Voz', description: 'Tono/estilo del contenido', category: 'semantic', icon_name: 'microphone', base_schema: { input_type: 'tone_selector', type: 'tone_selector', data_type: 'string', options: [{ value: 'profesional', label: 'Profesional' }, { value: 'casual', label: 'Casual' }, { value: 'inspirador', label: 'Inspirador' }] } },
      { id: 'length_selector', name: 'Longitud', description: 'Longitud del contenido', category: 'semantic', icon_name: 'text-align-left', base_schema: { input_type: 'length_selector', type: 'length_selector', data_type: 'string', options: [{ value: 'corto', label: 'Corto' }, { value: 'medio', label: 'Medio' }, { value: 'largo', label: 'Largo' }] } },
      { id: 'section', name: 'Sección', description: 'Agrupador visual', category: 'structural', icon_name: 'square', base_schema: { input_type: 'section', type: 'section' } },
      { id: 'divider', name: 'Divisor', description: 'Línea separadora', category: 'structural', icon_name: 'minus', base_schema: { input_type: 'divider', type: 'divider' } },
      { id: 'heading', name: 'Título', description: 'Título visual', category: 'structural', icon_name: 'type', base_schema: { input_type: 'heading', type: 'heading', text: 'Título', level: 2 } },
      { id: 'description', name: 'Texto informativo', description: 'Bloque de texto', category: 'structural', icon_name: 'align-left', base_schema: { input_type: 'description', type: 'description', text: '' } }
    ];
  }

  function getPropertyFamily(type) {
    var t = (type || '').toLowerCase();
    if (['string', 'text', 'textarea', 'prompt_input', 'tag_input', 'tags', 'slug_input'].indexOf(t) >= 0) return 'text';
    if (['number'].indexOf(t) >= 0) return 'number';
    if (['range', 'slider'].indexOf(t) >= 0) return 'range';
    if (['stepper_num', 'stepper', 'num_stepper', 'number'].indexOf(t) >= 0) return 'stepper';
    if (['checkbox'].indexOf(t) >= 0) return 'checkbox';
    if (['switch', 'toggle_switch', 'toggle'].indexOf(t) >= 0) return 'switch';
    if (t === 'colores') return 'colores';
    if (['select', 'dropdown', 'multi_select', 'radio', 'radio_buttons', 'choice_chips', 'multi_select_chips', 'flags', 'tone_selector', 'mood_selector', 'length_selector', 'selection_checkboxes'].indexOf(t) >= 0) return 'select';
    return 'generic';
  }

  /** true si el campo es solo layout (section, divider, accordion, etc.). */
  function isStructural(field) {
    return getContainerType(field) === 'STRUCTURAL_CONTAINER';
  }

  /** true si el control ya incluye su propio label (checkbox, radio, switch). */
  function hasOwnLabel(field) {
    return getContainerType(field) === 'BOOLEAN_CONTAINER';
  }

  /**
   * Envuelve el HTML del control en contenedor + label opcional + helper opcional.
   * @param {Object} field - key, label, description, required
   * @param {string} inputHtml - HTML del control (salida de renderFormField)
   * @param {Object} opts - idPrefix, wrapperClass, showLabel, showHelper, showRequired
   * @returns {string} HTML del bloque completo o '' si inputHtml vacío (estructural)
   */
  function wrapFormField(field, inputHtml, opts) {
    opts = opts || {};
    if (!inputHtml || inputHtml.trim() === '') return '';
    if (isStructural(field)) return inputHtml;
    var id = (opts.idPrefix || '') + (field.key || 'field');
    var labelText = escapeHtml(field.label || field.key || '');
    var showLabel = opts.showLabel !== false;
    var showHelper = opts.showHelper !== false && (field.description || '').trim() !== '';
    var showRequired = opts.showRequired === true && field.required;
    var requiredSpan = showRequired ? ' <span class="required">*</span>' : '';
    var helperClass = opts.helperClass || 'field-help';
    var addOuterLabel = showLabel && !hasOwnLabel(field);
    var helperHtml = showHelper ? '<span class="' + helperClass + '">' + escapeHtml(field.description) + '</span>' : '';
    var wrapperClass = (opts.wrapperClass || 'form-field').trim();
    var parts = [];
    if (addOuterLabel) parts.push('<label for="' + escapeHtml(id) + '">' + labelText + requiredSpan + '</label>');
    parts.push(inputHtml);
    if (helperHtml) parts.push(helperHtml);
    return '<div class="' + escapeHtml(wrapperClass) + '" data-key="' + escapeHtml(field.key || '') + '">' + parts.join('') + '</div>';
  }

  /**
   * Renderiza campo completo para formulario (control + wrapper + label + helper).
   * Una sola llamada para Studio, Test y Preview del Builder.
   * @param {Object} field - key, label, description, required, input_type, etc.
   * @param {Object} opts - idPrefix, namePrefix, disabled, required, wrapperClass, showLabel, showHelper, showRequired
   * @returns {string} HTML del bloque o '' para campos estructurales
   */
  function renderFormFieldWithWrapper(field, opts) {
    opts = opts || {};
    if (isStructural(field)) return '';
    var formOpts = { idPrefix: opts.idPrefix, namePrefix: opts.namePrefix, disabled: opts.disabled, required: opts.required };
    var inputHtml = renderFormField(field, formOpts);
    return wrapFormField(field, inputHtml, {
      idPrefix: opts.idPrefix,
      wrapperClass: opts.wrapperClass,
      showLabel: opts.showLabel,
      showHelper: opts.showHelper,
      showRequired: opts.showRequired,
      helperClass: opts.helperClass
    });
  }

  /**
   * Inicializa los selectores de colores (círculos): al hacer clic se toggle selección (máx. N) y se actualiza el hidden.
   * @param {Element} root - Contenedor donde buscar (ej. #formFields o document.body)
   */
  function initColorsPicker(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.input-colors-wrap[data-colors-max]').forEach(function (wrap) {
      if (wrap._colorsInit) return;
      wrap._colorsInit = true;
      var max = parseInt(wrap.getAttribute('data-colors-max'), 10) || 6;
      var hidden = wrap.previousElementSibling;
      if (!hidden || !hidden.classList.contains('input-colors-value')) hidden = wrap.parentElement.querySelector('.input-colors-value');
      wrap.querySelectorAll('.input-color-swatch').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var val = btn.getAttribute('data-value');
          var cur = (hidden.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          var idx = cur.indexOf(val);
          if (idx >= 0) {
            cur.splice(idx, 1);
          } else if (cur.length < max) {
            cur.push(val);
          }
          hidden.value = cur.join(',');
          wrap.querySelectorAll('.input-color-swatch').forEach(function (b) {
            var v = b.getAttribute('data-value');
            b.classList.toggle('selected', cur.indexOf(v) >= 0);
            b.setAttribute('aria-pressed', cur.indexOf(v) >= 0 ? 'true' : 'false');
          });
          if (hidden.dispatchEvent) hidden.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
  }

  var InputRegistry = {
    CONTAINER_TYPES: CONTAINER_TYPES,
    getContainerType: getContainerType,
    getInputType: getInputType,
    getRenderer: getRenderer,
    register: register,
    renderPreview: renderPreview,
    renderFormField: renderFormField,
    wrapFormField: wrapFormField,
    renderFormFieldWithWrapper: renderFormFieldWithWrapper,
    isStructural: isStructural,
    hasOwnLabel: hasOwnLabel,
    getDefaultTemplates: getDefaultTemplates,
    getPropertyFamily: getPropertyFamily,
    escapeHtml: escapeHtml,
    initColorsPicker: initColorsPicker,
    CONTAINER_RENDERERS: CONTAINER_RENDERERS
  };

  global.InputRegistry = InputRegistry;
})(typeof window !== 'undefined' ? window : this);
