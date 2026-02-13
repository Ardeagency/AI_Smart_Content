/**
 * Input Registry - Sistema de render dinámico de inputs (UI schema-driven).
 * No hardcodear inputs: cada tipo tiene plantilla de preview y de formulario.
 * @see docs/INPUT_TAXONOMY.md
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getInputType(field) {
    return (field && (field.input_type || field.type)) ? String(field.input_type || field.type).toLowerCase() : 'text';
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
    return '<select class="preview-input" disabled><option value="">' + ph + '</option>' + list + '</select>';
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

  // --- Form (formulario real: name, id, required) ---
  function formAttrs(f, opts) {
    var name = (opts.namePrefix || '') + (f.key || 'field');
    var id = (opts.idPrefix || '') + (f.key || 'field');
    var dis = opts.disabled ? ' disabled' : '';
    var req = (opts.required !== false && f.required) ? ' required' : '';
    return { name: name, id: id, disabled: dis, required: req };
  }

  function formText(f, opts) {
    var a = formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || '');
    return '<input type="text" id="' + a.id + '" name="' + a.name + '" placeholder="' + ph + '"' + a.disabled + a.required + '>';
  }
  function formTextarea(f, opts) {
    var a = formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || '');
    var rows = f.rows || 4;
    return '<textarea id="' + a.id + '" name="' + a.name + '" rows="' + rows + '" placeholder="' + ph + '"' + a.disabled + a.required + '></textarea>';
  }
  function formSelect(f, opts) {
    var a = formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || 'Seleccionar...');
    var optsList = f.options || [];
    var optionsHtml = '<option value="">' + ph + '</option>' + optsList.map(function (o) {
      return '<option value="' + escapeHtml(String(optVal(o))) + '">' + escapeHtml(optLabel(o)) + '</option>';
    }).join('');
    return '<select id="' + a.id + '" name="' + a.name + '"' + a.disabled + a.required + '>' + optionsHtml + '</select>';
  }
  function formNumber(f, opts) {
    var a = formAttrs(f, opts);
    var ph = escapeHtml(f.placeholder || '');
    var min = f.min != null ? ' min="' + f.min + '"' : '';
    var max = f.max != null ? ' max="' + f.max + '"' : '';
    var step = f.step != null ? ' step="' + f.step + '"' : '';
    var val = f.defaultValue != null ? ' value="' + escapeHtml(String(f.defaultValue)) + '"' : '';
    return '<input type="number" id="' + a.id + '" name="' + a.name + '" placeholder="' + ph + '"' + min + max + step + val + a.disabled + a.required + '>';
  }
  function formCheckbox(f, opts) {
    var a = formAttrs(f, opts);
    var lb = escapeHtml(f.label || f.key || '');
    var checked = f.defaultValue ? ' checked' : '';
    return '<label class="checkbox-label"><input type="checkbox" id="' + a.id + '" name="' + a.name + '"' + checked + a.disabled + '><span>' + lb + '</span></label>';
  }
  function formRadio(f, opts) {
    var a = formAttrs(f, opts);
    var optsList = f.options || [];
    var group = optsList.map(function (o, i) {
      return '<label class="radio-label"><input type="radio" name="' + a.name + '" value="' + escapeHtml(String(optVal(o))) + '"' + (i === 0 ? ' checked' : '') + a.disabled + '> ' + escapeHtml(optLabel(o)) + '</label>';
    }).join('');
    return '<div class="radio-group">' + group + '</div>';
  }
  function formRange(f, opts) {
    var a = formAttrs(f, opts);
    var min = f.min != null ? f.min : 0;
    var max = f.max != null ? f.max : 100;
    var step = f.step != null ? f.step : 1;
    var val = f.defaultValue != null ? f.defaultValue : 50;
    return '<div class="range-input"><input type="range" id="' + a.id + '" name="' + a.name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"' + a.disabled + '><span class="range-value">' + val + '</span></div>';
  }
  function formContextPlaceholder(f, opts, label) {
    var a = formAttrs(f, opts);
    return '<input type="text" id="' + a.id + '" name="' + a.name + '" placeholder="' + escapeHtml(label || 'ID o valor...') + '"' + a.disabled + a.required + '>';
  }
  function formSwitch(f, opts) {
    var a = formAttrs(f, opts);
    var lb = escapeHtml(f.label || '');
    var checked = f.defaultValue ? ' checked' : '';
    return '<label class="switch-label"><input type="checkbox" id="' + a.id + '" name="' + a.name + '" class="input-switch"' + checked + a.disabled + '><span>' + lb + '</span></label>';
  }
  function formStructural() {
    return '';
  }

  // Registrar todos los tipos
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

    register('image_selector', { preview: function () { return previewContext('Selector de Imagen'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'URL o ID de imagen...'); } });
    register('gallery_picker', { preview: function () { return previewContext('Galería'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'IDs separados por coma...'); } });
    register('product_selector', { preview: function () { return previewContext('Selector de Producto'); }, form: function (f, o) { return formContextPlaceholder(f, o, 'UUID de producto...'); } });

    register('multi_select', { preview: previewSelect, form: formSelect });

    register('section', { preview: function () { return previewBlock('Sección', 'square'); }, form: formStructural });
    register('divider', { preview: function () { return previewBlock('Divisor', 'minus'); }, form: formStructural });
    register('description_block', { preview: function () { return previewBlock('Texto informativo', 'info'); }, form: formStructural });
  }
  registerAll();

  function getRenderer(type) {
    return INPUT_RENDERERS[type] || INPUT_RENDERERS['text'];
  }

  /**
   * Renderiza el preview del campo (canvas del Builder).
   * @param {Object} field - Campo con key, label, input_type, placeholder, options, etc.
   * @returns {string} HTML
   */
  function renderPreview(field) {
    var type = getInputType(field);
    var r = getRenderer(type);
    return r.preview ? r.preview(field) : previewText(field);
  }

  /**
   * Renderiza el campo para formulario (Studio, Test, Preview).
   * @param {Object} field - Campo con key, label, input_type, required, etc.
   * @param {Object} opts - { mode: 'preview'|'test'|'studio', idPrefix, namePrefix, disabled, required }
   * @returns {string} HTML del input (sin wrapper label/helper).
   */
  function renderFormField(field, opts) {
    opts = opts || {};
    var type = getInputType(field);
    var r = getRenderer(type);
    var formFn = r.form;
    if (!formFn) return formText(field, opts);
    return formFn(field, opts);
  }

  /**
   * Plantillas por defecto para el Builder cuando no hay BD.
   * Cada una tiene id, name, description, category, icon_name, base_schema.
   */
  function getDefaultTemplates() {
    return [
      { id: 'text', name: 'Texto Corto', description: 'Campo de texto de una línea', category: 'basic', icon_name: 'textbox', base_schema: { input_type: 'text', type: 'text', data_type: 'string', placeholder: '', maxLength: 255 } },
      { id: 'textarea', name: 'Texto Largo', description: 'Área de texto multilínea', category: 'basic', icon_name: 'article', base_schema: { input_type: 'textarea', type: 'textarea', data_type: 'string', placeholder: '', rows: 4, maxLength: 2000 } },
      { id: 'prompt_input', name: 'Prompt IA', description: 'Prompt para generación con IA', category: 'smart_text', icon_name: 'terminal', base_schema: { input_type: 'prompt_input', type: 'prompt_input', data_type: 'string', placeholder: 'Describe el contenido...', rows: 6 } },
      { id: 'select', name: 'Lista Desplegable', description: 'Selector de opciones', category: 'basic', icon_name: 'list-bullets', base_schema: { input_type: 'select', type: 'select', data_type: 'string', options: [] } },
      { id: 'number', name: 'Número', description: 'Campo numérico', category: 'basic', icon_name: 'hash', base_schema: { input_type: 'number', type: 'number', data_type: 'number', min: 0, max: 100, step: 1 } },
      { id: 'checkbox', name: 'Checkbox', description: 'Casilla de verificación', category: 'basic', icon_name: 'check-square', base_schema: { input_type: 'checkbox', type: 'checkbox', data_type: 'boolean', defaultValue: false } },
      { id: 'radio', name: 'Radio', description: 'Opciones mutuamente excluyentes', category: 'basic', icon_name: 'radio-button', base_schema: { input_type: 'radio', type: 'radio', data_type: 'string', options: [] } },
      { id: 'range', name: 'Slider', description: 'Control deslizante', category: 'controls', icon_name: 'sliders', base_schema: { input_type: 'range', type: 'range', data_type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 } },
      { id: 'switch', name: 'Switch', description: 'Interruptor on/off', category: 'controls', icon_name: 'toggle-left', base_schema: { input_type: 'switch', type: 'switch', data_type: 'boolean', defaultValue: false } },
      { id: 'brand_selector', name: 'Selector de Marca', description: 'Selecciona una marca', category: 'brand', icon_name: 'storefront', base_schema: { input_type: 'brand_selector', type: 'brand_selector', data_type: 'object' } },
      { id: 'entity_selector', name: 'Selector de Entidad', description: 'Producto/servicio', category: 'brand', icon_name: 'package', base_schema: { input_type: 'entity_selector', type: 'entity_selector', data_type: 'object', entityTypes: ['product', 'service'] } },
      { id: 'audience_selector', name: 'Selector de Audiencia', description: 'Audiencia definida', category: 'brand', icon_name: 'users', base_schema: { input_type: 'audience_selector', type: 'audience_selector', data_type: 'object' } },
      { id: 'tone_selector', name: 'Tono de Voz', description: 'Tono/estilo del contenido', category: 'semantic', icon_name: 'microphone', base_schema: { input_type: 'tone_selector', type: 'tone_selector', data_type: 'string', options: [{ value: 'profesional', label: 'Profesional' }, { value: 'casual', label: 'Casual' }, { value: 'inspirador', label: 'Inspirador' }] } },
      { id: 'length_selector', name: 'Longitud', description: 'Longitud del contenido', category: 'semantic', icon_name: 'text-align-left', base_schema: { input_type: 'length_selector', type: 'length_selector', data_type: 'string', options: [{ value: 'corto', label: 'Corto' }, { value: 'medio', label: 'Medio' }, { value: 'largo', label: 'Largo' }] } },
      { id: 'image_selector', name: 'Selector de Imagen', description: 'Imagen de referencia', category: 'media', icon_name: 'image', base_schema: { input_type: 'image_selector', type: 'image_selector', data_type: 'object' } },
      { id: 'product_selector', name: 'Selector de Producto', description: 'Producto (único o múltiple)', category: 'brand', icon_name: 'shopping-bag', base_schema: { input_type: 'product_selector', type: 'product_selector', data_type: 'object' } },
      { id: 'tag_input', name: 'Tags', description: 'Etiquetas o palabras clave', category: 'smart_text', icon_name: 'tag', base_schema: { input_type: 'tag_input', type: 'tag_input', data_type: 'array', placeholder: 'Añade tags...' } },
      { id: 'section', name: 'Sección', description: 'Agrupador visual', category: 'structural', icon_name: 'square', base_schema: { input_type: 'section', type: 'section' } },
      { id: 'divider', name: 'Divisor', description: 'Línea separadora', category: 'structural', icon_name: 'minus', base_schema: { input_type: 'divider', type: 'divider' } }
    ];
  }

  function getPropertyFamily(type) {
    var t = (type || '').toLowerCase();
    if (['text', 'textarea', 'prompt_input', 'tag_input', 'slug_input'].indexOf(t) >= 0) return 'text';
    if (['number', 'range'].indexOf(t) >= 0) return 'number';
    if (['select', 'radio', 'tone_selector', 'mood_selector', 'length_selector'].indexOf(t) >= 0) return 'select';
    return 'generic';
  }

  /** true si el tipo no genera control editable (section, divider, description_block) */
  function isStructural(field) {
    var t = getInputType(field);
    return t === 'section' || t === 'divider' || t === 'description_block';
  }

  /** true si el control ya incluye su propio label (checkbox, radio, switch) */
  function hasOwnLabel(field) {
    var t = getInputType(field);
    return t === 'checkbox' || t === 'radio' || t === 'switch' || t === 'boolean';
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

  var InputRegistry = {
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
    escapeHtml: escapeHtml
  };

  global.InputRegistry = InputRegistry;
})(typeof window !== 'undefined' ? window : this);
