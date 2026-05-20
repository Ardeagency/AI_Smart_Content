/**
 * Input Registry - Arquitectura por contenedores (Render Container Registry).
 * Contenedores = UI real (string, dropdown, colores, aspect_ratio, scope_picker, etc.).
 * Plantillas (tone_selector, brand_selector, product_selector, etc.) son nombres con config
 * que usan un contenedor existente (SELECT_CONTAINER o STRING_CONTAINER).
 */
(function (global) {
  'use strict';

  /** Contenedores reales: cada uno es una UI distinta. */
  var CONTAINER_TYPES = [
    'STRING_CONTAINER',
    'SELECT_CONTAINER',
    'COLORS_CONTAINER',
    'ASPECT_RATIO_CONTAINER',
    'SCOPE_PICKER_CONTAINER',
    'MEDIA_CONTAINER',
    'BOOLEAN_CONTAINER',
    'NUMBER_CONTAINER',
    'RANGE_CONTAINER',
    'FILE_CONTAINER',
    'STRUCTURAL_CONTAINER'
  ];

  /** Plantillas de contexto: solo placeholder (usan STRING_CONTAINER). */
  var CONTEXT_TEMPLATE_TYPES = ['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector'];

  /** Mapeo: input_type → contenedor de render. Plantillas (tone_selector, brand_selector, etc.) apuntan al contenedor que usan. */
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
    brand_selector: 'STRING_CONTAINER',
    entity_selector: 'STRING_CONTAINER',
    audience_selector: 'STRING_CONTAINER',
    campaign_selector: 'STRING_CONTAINER',
    product_selector: 'STRING_CONTAINER',
    select: 'SELECT_CONTAINER',
    dropdown: 'SELECT_CONTAINER',
    multi_select: 'SELECT_CONTAINER',
    choice_chips: 'SELECT_CONTAINER',
    multi_select_chips: 'SELECT_CONTAINER',
    checkboxes: 'SELECT_CONTAINER',
    flags: 'SELECT_CONTAINER',
    tone_selector: 'SELECT_CONTAINER',
    mood_selector: 'SELECT_CONTAINER',
    length_selector: 'SELECT_CONTAINER',
    colores: 'COLORS_CONTAINER',
    aspect_ratio: 'ASPECT_RATIO_CONTAINER',
    scope_picker: 'SCOPE_PICKER_CONTAINER',
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
    selection_checkboxes: 'SELECT_CONTAINER',
    number: 'NUMBER_CONTAINER',
    stepper: 'NUMBER_CONTAINER',
    stepper_num: 'NUMBER_CONTAINER',
    num_stepper: 'NUMBER_CONTAINER',
    rating: 'NUMBER_CONTAINER',
    range: 'RANGE_CONTAINER',
    slider: 'RANGE_CONTAINER',
    file: 'FILE_CONTAINER',
    upload: 'FILE_CONTAINER',
    cron_schedule: 'STRING_CONTAINER',
    section: 'STRUCTURAL_CONTAINER',
    divider: 'STRUCTURAL_CONTAINER',
    heading: 'STRUCTURAL_CONTAINER',
    description: 'STRUCTURAL_CONTAINER',
    description_block: 'STRUCTURAL_CONTAINER',
    accordion: 'STRUCTURAL_CONTAINER',
    tabs: 'STRUCTURAL_CONTAINER',
    repeater: 'STRUCTURAL_CONTAINER',
    group: 'STRUCTURAL_CONTAINER',
    conditional_block: 'STRUCTURAL_CONTAINER',
    // ===== Selectores creativos / preset dropdowns (Bug 6) =====
    // Todos los input_types específicos de la DB ui_component_templates que antes
    // caían al fallback STRING_CONTAINER. Cada uno es un select con options
    // pre-armadas (preset selectors). El dev configura las options del template
    // y el usuario final elige una en /studio.
    // Estilo & Cámara
    camera_angle: 'SELECT_CONTAINER',
    shot_type: 'SELECT_CONTAINER',
    lens_focal_length: 'SELECT_CONTAINER',
    depth_of_field: 'SELECT_CONTAINER',
    composition_structure: 'SELECT_CONTAINER',
    lighting_style: 'SELECT_CONTAINER',
    color_grade_preset: 'SELECT_CONTAINER',
    contrast_level: 'SELECT_CONTAINER',
    saturation_level: 'SELECT_CONTAINER',
    grain_amount: 'SELECT_CONTAINER',
    glow_amount: 'SELECT_CONTAINER',
    finish_type: 'SELECT_CONTAINER',
    floating_product: 'SELECT_CONTAINER',
    // Motion & Perspectiva
    camera_movement: 'SELECT_CONTAINER',
    camera_path: 'SELECT_CONTAINER',
    camera_roll: 'SELECT_CONTAINER',
    focus_pull: 'SELECT_CONTAINER',
    shot_speed: 'SELECT_CONTAINER',
    frame_rate_style: 'SELECT_CONTAINER',
    motion_style_video: 'SELECT_CONTAINER',
    zoom_behavior: 'SELECT_CONTAINER',
    loop_behavior: 'SELECT_CONTAINER',
    parallax_layers: 'SELECT_CONTAINER',
    perspective_grid: 'SELECT_CONTAINER',
    transition_anchor: 'SELECT_CONTAINER',
    vanishing_point_bias: 'SELECT_CONTAINER',
    // Escenarios
    background_type: 'SELECT_CONTAINER',
    environment_theme: 'SELECT_CONTAINER',
    props_density: 'RANGE_CONTAINER',
    // Protagonistas
    emotion_profile: 'SELECT_CONTAINER',
    ethnicity_profile: 'SELECT_CONTAINER',
    eye_color: 'SELECT_CONTAINER',
    hair_color: 'SELECT_CONTAINER',
    hair_style: 'SELECT_CONTAINER',
    pose_direction: 'SELECT_CONTAINER',
    wardrobe_style: 'SELECT_CONTAINER',
    // Audio
    audio_mood: 'SELECT_CONTAINER',
    lang_selector: 'SELECT_CONTAINER',
    music_bpm: 'NUMBER_CONTAINER',
    voice_profile: 'SELECT_CONTAINER',
    sound_design_notes: 'STRING_CONTAINER',
    // Branding & Copy
    headline_slot: 'STRING_CONTAINER',
    body_slot: 'STRING_CONTAINER',
    brand_positioning: 'SELECT_CONTAINER',
    cta_layering: 'SELECT_CONTAINER',
    message_focus: 'SELECT_CONTAINER',
    overlay_safe_zone: 'SELECT_CONTAINER',
    legal_disclaimer: 'STRING_CONTAINER',
    logo_lockup: 'SELECT_CONTAINER',
    // Distribución / Plataforma
    platform_selector: 'SELECT_CONTAINER',
    duration_cap: 'NUMBER_CONTAINER',
    render_batch_size: 'NUMBER_CONTAINER',
    flow_selector: 'SELECT_CONTAINER',
    // Presets completos (cada uno aplica un schema entero; visualmente = select)
    preset_dark_luxury_hero: 'SELECT_CONTAINER',
    preset_editorial_macro: 'SELECT_CONTAINER',
    // Otros selectores que tenían el handler como STRING (corrige)
    focus_selector: 'SELECT_CONTAINER',
    // Nuevos inputs Tier 2
    segmented_control: 'SEGMENTED_CONTAINER',
    steps_slider: 'STEPS_SLIDER_CONTAINER',
    // Tier 3 — sliders especializados
    color_slider: 'COLOR_SLIDER_CONTAINER',
    white_balance: 'WHITE_BALANCE_CONTAINER',
    rotation_dial: 'ROTATION_DIAL_CONTAINER'
  };

  // Delegamos en BaseView.escapeHtml (fuente única). Fallback defensivo por si
  // input-registry se llegara a cargar antes que BaseView en alguna ruta futura.
  function escapeHtml(str) {
    if (typeof BaseView !== 'undefined' && typeof BaseView.escapeHtml === 'function') {
      return BaseView.escapeHtml(str);
    }
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch];
    });
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

  function isContextTemplate(field) {
    var t = getInputType(field);
    return CONTEXT_TEMPLATE_TYPES.indexOf(t) >= 0;
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

  /** cron_schedule: programación de ejecución (solo flujos automated). Presets + expresión cron. */
  function previewCronSchedule(f) {
    var lb = escapeHtml(f.label || 'Programación');
    return '<div class="preview-cron-schedule"><i class="ph ph-clock"></i><span>' + lb + '</span></div>';
  }
  function formCronSchedule(f, opts) {
    var a = formAttrs(f, opts || {});
    var presets = f.presets || [
      { label: 'Todos los días a las 9:00', value: '0 9 * * *' },
      { label: 'Cada 6 horas', value: '0 */6 * * *' },
      { label: 'Cada hora', value: '0 * * * *' },
      { label: 'Diario a medianoche', value: '0 0 * * *' }
    ];
    var current = (f.defaultValue != null ? String(f.defaultValue) : '') || (presets[0] && presets[0].value) || '';
    var optionsHtml = presets.map(function (p) {
      var v = escapeHtml(String(p.value != null ? p.value : p.label));
      var lbl = escapeHtml(p.label != null ? p.label : v);
      var sel = (current === v || current === (p.value != null ? String(p.value) : '')) ? ' selected' : '';
      return '<option value="' + v + '"' + sel + '>' + lbl + '</option>';
    }).join('');
    var ph = escapeHtml(f.placeholder || '0 9 * * *');
    return (
      '<div class="input-cron-schedule-wrap">' +
        '<select class="modern-input input-cron-presets" id="' + a.id + '_preset" name="' + a.name + '_preset" aria-label="Preset programación">' +
          optionsHtml +
          '<option value="__custom__">Otro (cron personalizado)</option>' +
        '</select>' +
        '<input type="text" class="modern-input input-cron-expression" id="' + a.id + '" name="' + a.name + '" placeholder="' + ph + '" value="' + (current || '').replace(/"/g, '&quot;') + '"' + a.disabled + a.required + ' pattern="[0-9*,\\-/ ]+" title="Expresión cron (ej: 0 9 * * *)">' +
      '</div>'
    );
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

    // Defensa: si el template no trae options pre-armadas, mostrar el dropdown
    // deshabilitado con un mensaje claro en lugar de un <select> vacío silencioso.
    // Así el dev nota que el template está incompleto al verlo en /studio o canvas.
    if (!Array.isArray(optsList) || optsList.length === 0) {
      var msg = '⚠ Sin opciones configuradas. Edita las opciones del campo en el panel de propiedades.';
      var disabledSel = '<select class="modern-input input-dropdown-select input-dropdown-select--no-options" id="' + a.id + '" name="' + a.name + '" disabled>' +
        '<option value="" disabled selected>' + escapeHtml(msg) + '</option></select>';
      return '<div class="input-dropdown-wrap input-dropdown-wrap--empty">' + disabledSel + '</div>';
    }

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
      // Si options llega como [] (no solo null/undefined), igual usar fallback
      // — antes el array vacío cortocircuitaba el ||, dejando un .radio-group
      // vacío que se veía como una línea fina horizontal.
      var optsList = (Array.isArray(f.options) && f.options.length > 0)
        ? f.options
        : [{ label: 'Opción 1', value: 'opcion1' }, { label: 'Opción 2', value: 'opcion2' }];
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
  /** Preview en canvas del Builder: bloque tipo acordeón para selectores de enfoque (solo scope_picker). */
  function previewFocusSelectorAccordion(f) {
    var label = f.label || 'Enfoque de la producción';
    return (
      '<div class="preview-focus-selector">' +
        '<div class="preview-focus-selector-header">' +
          '<i class="ph ph-caret-down"></i>' +
          '<span>' + escapeHtml(label) + '</span>' +
          '<span class="preview-focus-selector-badge">Que la IA decida</span>' +
        '</div>' +
      '</div>'
    );
  }

  /** scope_picker AHORA es un contenedor anidable (no más toggle "Que la IA decida").
   *  section TAMBIÉN es contenedor con display_style. Ambos comparten renderContainerField. */
  function previewScopePicker(f) {
    return renderContainerField(f, {}, true, 'scope_picker');
  }
  function formScopePicker(f, opts) {
    return renderContainerField(f, opts || {}, isPreviewOpts(opts), 'scope_picker');
  }

  /** Renderiza un contenedor (scope_picker o section) con sus children anidados.
   *  display_style soportado: 'flat' (default), 'accordion', 'tabs', 'bordered'.
   *  Si display_style='tabs', cada child cuyo input_type sea section/scope_picker
   *  se vuelve una tab; el resto va al panel del primer tab.
   *  Para scope_picker: el header incluye un toggle "Vera" que cuando ON
   *  oculta los children y envía un prompt predefinido al LLM. */
  function renderContainerField(f, opts, isPreview, sourceType) {
    opts = opts || {};
    var display = (f.display_style || 'flat').toLowerCase();
    var children = Array.isArray(f.children) ? f.children : [];
    var label = escapeHtml(f.label || f.title || '');
    var description = escapeHtml(f.section_description || f.description || '');
    var key = escapeHtml(f.key || '');
    var typeAttr = ' data-container-type="' + escapeHtml(sourceType || (f.input_type || 'section')) + '"';

    // Vera switch (solo scope_picker)
    var isScopePicker = sourceType === 'scope_picker' || f.input_type === 'scope_picker';
    var veraPrompt = escapeHtml(f.vera_prompt || '');
    var veraSwitch = '';
    if (isScopePicker) {
      veraSwitch =
        '<label class="scope-vera-toggle" title="Cuando está activado, Vera genera los valores usando el prompt predefinido">' +
          '<input type="checkbox" class="scope-vera-input" data-vera-key="' + key + '"' + (isPreview ? ' disabled' : '') + '>' +
          '<span class="scope-vera-track"><span class="scope-vera-thumb"></span></span>' +
          '<span class="scope-vera-label"><i class="ph ph-sparkle"></i> Vera</span>' +
        '</label>';
    }
    // Panel del prompt de Vera (visible cuando switch ON; el dev lo configura en builder)
    var veraPanel = '';
    if (isScopePicker) {
      veraPanel =
        '<div class="scope-vera-panel" aria-hidden="true">' +
          '<div class="scope-vera-panel-label"><i class="ph ph-sparkle"></i> Vera generará los valores usando este prompt:</div>' +
          '<div class="scope-vera-prompt">' + (veraPrompt || '<span class="scope-vera-prompt-empty">Sin prompt configurado. El dev debe definirlo en el builder.</span>') + '</div>' +
        '</div>';
    }

    var renderChild = function (child) {
      // Hashing recursivo a renderFormFieldWithWrapper sin estructura wrapperClass studio-field
      // (cada child se renderiza como un field normal, anidable).
      return renderFormFieldWithWrapper(child, {
        idPrefix: opts.idPrefix,
        wrapperClass: 'studio-field input-container-child',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
    };

    // Empty state: si el container no tiene children todavía, mostrar dropzone visual
    if (children.length === 0) {
      return '<div class="input-container input-container--' + display + ' input-container--empty"' + typeAttr + ' data-container-key="' + key + '">' +
        ((label || veraSwitch) ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span>' + veraSwitch + '</div>' : '') +
        veraPanel +
        '<div class="input-container-empty-msg"><i class="ph ph-rows"></i><span>Contenedor vacío — arrastra inputs aquí</span></div>' +
        '</div>';
    }

    if (display === 'accordion') {
      // Si los children son a su vez containers, cada uno = panel del accordion.
      // Sino, todo el container es UN accordion con los fields planos adentro.
      var nestedContainers = children.filter(function (c) { return c.input_type === 'section' || c.input_type === 'scope_picker'; });
      if (nestedContainers.length === children.length && nestedContainers.length > 0) {
        // Multi-accordion: cada child es un panel
        var panelsHtml = nestedContainers.map(function (c, i) {
          var cKey = escapeHtml(c.key || ('panel_' + i));
          var cLbl = escapeHtml(c.label || c.title || 'Panel ' + (i + 1));
          var cChildren = (Array.isArray(c.children) ? c.children : []).map(renderChild).join('');
          return '<details class="input-accordion-panel"' + (i === 0 ? ' open' : '') + '>' +
            '<summary class="input-accordion-summary"><span>' + cLbl + '</span><i class="ph ph-caret-down"></i></summary>' +
            '<div class="input-accordion-body" data-container-key="' + cKey + '">' + cChildren + '</div>' +
            '</details>';
        }).join('');
        return '<div class="input-container input-container--accordion"' + typeAttr + ' data-container-key="' + key + '">' +
          (label ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span></div>' : '') +
          '<div class="input-accordion-group">' + panelsHtml + '</div>' +
          '</div>';
      }
      // Single accordion: todo el container colapsable
      var bodyChildren = children.map(renderChild).join('');
      return '<details class="input-container input-container--accordion"' + typeAttr + ' data-container-key="' + key + '" open>' +
        '<summary class="input-accordion-summary"><span>' + (label || 'Sección') + '</span>' + veraSwitch + '<i class="ph ph-caret-down"></i></summary>' +
        (description ? '<p class="input-container-desc">' + description + '</p>' : '') +
        veraPanel +
        '<div class="input-accordion-body">' + bodyChildren + '</div>' +
        '</details>';
    }

    if (display === 'tabs') {
      // Cada child sub-container (section/scope_picker) = una tab. Si no hay
      // sub-containers, los fields planos se renderean como un solo panel
      // (igual que flat, pero con header tabs-like).
      var tabChildren = children.filter(function (c) { return c.input_type === 'section' || c.input_type === 'scope_picker'; });
      if (tabChildren.length > 0) {
        var tabsHtml = tabChildren.map(function (c, i) {
          var cKey = escapeHtml(c.key || ('tab_' + i));
          var cLbl = escapeHtml(c.label || c.title || 'Tab ' + (i + 1));
          return '<button type="button" class="input-tab-btn' + (i === 0 ? ' active' : '') + '" data-tab-key="' + cKey + '"' + (isPreview ? ' tabindex="-1"' : '') + '>' + cLbl + '</button>';
        }).join('');
        var panelsHtml = tabChildren.map(function (c, i) {
          var cKey = escapeHtml(c.key || ('tab_' + i));
          var cChildren = (Array.isArray(c.children) ? c.children : []).map(renderChild).join('');
          return '<div class="input-tab-panel' + (i === 0 ? ' active' : '') + '" data-tab-key="' + cKey + '">' + cChildren + '</div>';
        }).join('');
        return '<div class="input-container input-container--tabs"' + typeAttr + ' data-container-key="' + key + '">' +
          ((label || veraSwitch) ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span>' + veraSwitch + '</div>' : '') +
          veraPanel +
          '<div class="input-tabs-header" role="tablist">' + tabsHtml + '</div>' +
          '<div class="input-tabs-body">' + panelsHtml + '</div>' +
          '</div>';
      }
      // Fallback: si no hay sub-containers, mostrar como flat con un mensaje
      var flatHtml = children.map(renderChild).join('');
      return '<div class="input-container input-container--tabs input-container--tabs-flat"' + typeAttr + ' data-container-key="' + key + '">' +
        ((label || veraSwitch) ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span>' + veraSwitch + '</div>' : '') +
        veraPanel +
        '<p class="input-container-hint">Añade un section/scope_picker como child para crear tabs.</p>' +
        '<div class="input-container-body">' + flatHtml + '</div>' +
        '</div>';
    }

    // Bordered: con border + radius (estilo card)
    if (display === 'bordered') {
      var borderedHtml = children.map(renderChild).join('');
      return '<div class="input-container input-container--bordered"' + typeAttr + ' data-container-key="' + key + '">' +
        ((label || veraSwitch) ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span>' + veraSwitch + '</div>' : '') +
        (description ? '<p class="input-container-desc">' + description + '</p>' : '') +
        veraPanel +
        '<div class="input-container-body">' + borderedHtml + '</div>' +
        '</div>';
    }

    // Default: flat — solo el label (si hay) + children sin borde
    var flatChildren = children.map(renderChild).join('');
    return '<div class="input-container input-container--flat"' + typeAttr + ' data-container-key="' + key + '">' +
      ((label || veraSwitch) ? '<div class="input-container-header"><span class="input-container-title">' + label + '</span>' + veraSwitch + '</div>' : '') +
      (description ? '<p class="input-container-desc">' + description + '</p>' : '') +
      veraPanel +
      '<div class="input-container-body">' + flatChildren + '</div>' +
      '</div>';
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
      // Section AHORA es contenedor: si tiene children o display_style, delega
      // a renderContainerField (flat/accordion/tabs/bordered)
      if (Array.isArray(f.children) || f.display_style) {
        return renderContainerField(f, {}, false, 'section');
      }
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

  /** Aspect ratio: iconos 16x16 en fila (verticales, horizontales, cuadrado). Sin fondo ni borde en celdas. */
  var DEFAULT_ASPECT_RATIO_OPTIONS = [
    { value: '2:3', label: '2:3' },
    { value: '3:4', label: '3:4' },
    { value: '4:5', label: '4:5' },
    { value: '9:16', label: '9:16' },
    { value: '3:2', label: '3:2' },
    { value: '4:3', label: '4:3' },
    { value: '5:4', label: '5:4' },
    { value: '16:9', label: '16:9' },
    { value: '21:9', label: '21:9' },
    { value: '1:1', label: '1:1' }
  ];
  function getAspectRatioOptions(f) {
    return (f.options && f.options.length) ? f.options : DEFAULT_ASPECT_RATIO_OPTIONS;
  }
  function previewAspectRatio(f) {
    var opts = getAspectRatioOptions(f);
    var slice = opts.slice(0, 8);
    var html = slice.map(function (o) {
      var v = escapeHtml(String(o.value || o));
      var lbl = escapeHtml(o.label != null ? o.label : v);
      return '<div class="aspect-ratio-card aspect-ratio-card--preview"><span class="aspect-ratio-icon" data-ratio="' + v + '" aria-hidden="true"></span><span class="aspect-ratio-label">' + lbl + '</span></div>';
    }).join('');
    return '<div class="aspect-ratio-grid aspect-ratio-grid--preview">' + html + '</div>';
  }
  function formAspectRatio(f, opts) {
    opts = opts || {};
    var a = formAttrs(f, opts);
    var isPreview = isPreviewOpts(opts);
    var optsList = getAspectRatioOptions(f);
    var selected = f.defaultValue != null ? String(f.defaultValue) : (optsList[0] && (optsList[0].value != null ? optsList[0].value : optsList[0]));
    if (isPreview) {
      var previewHtml = optsList.slice(0, 8).map(function (o) {
        var v = o.value != null ? o.value : o;
        var vs = escapeHtml(String(v));
        var lbl = escapeHtml(o.label != null ? o.label : vs);
        return '<div class="aspect-ratio-card aspect-ratio-card--preview"><span class="aspect-ratio-icon" data-ratio="' + vs + '"></span><span class="aspect-ratio-label">' + lbl + '</span></div>';
      }).join('');
      return '<div class="aspect-ratio-grid aspect-ratio-grid--preview">' + previewHtml + '</div>';
    }
    var cardsHtml = optsList.map(function (o) {
      var v = o.value != null ? o.value : o;
      var vs = escapeHtml(String(v));
      var lbl = escapeHtml(o.label != null ? o.label : vs);
      var isSel = (selected === v || selected === vs);
      return '<button type="button" class="aspect-ratio-card' + (isSel ? ' selected' : '') + '" data-value="' + vs + '"' + (a.disabled ? ' disabled' : '') + ' aria-pressed="' + (isSel ? 'true' : 'false') + '" title="' + lbl + '"><span class="aspect-ratio-icon" data-ratio="' + vs + '"></span><span class="aspect-ratio-label">' + lbl + '</span></button>';
    }).join('');
    return '<input type="hidden" class="aspect-ratio-value" name="' + escapeHtml(a.name) + '" id="' + escapeHtml(a.id) + '" value="' + escapeHtml(selected) + '"' + (a.required ? ' required' : '') + '>' +
      '<div class="aspect-ratio-grid" data-aspect-ratio-picker="1" data-aspect-ratio-key="' + escapeHtml(f.key || '') + '" role="group" aria-label="' + escapeHtml(f.label || 'Formato de producción') + '">' + cardsHtml + '</div>';
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

  /** Segmented control: pill toggle 2-4 opciones (estilo iOS/tabs).
   *  HTML: container con N buttons + input hidden con el valor seleccionado. */
  function renderSegmentedControl(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var optsList = (Array.isArray(f.options) && f.options.length > 0)
      ? f.options
      : [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
    var selected = f.defaultValue != null ? String(f.defaultValue) : String(optVal(optsList[0]));
    var buttonsHtml = optsList.map(function (o) {
      var v = optVal(o);
      var vs = String(v);
      var lbl = escapeHtml(optLabel(o));
      var isSel = (selected === v || selected === vs);
      return '<button type="button" class="input-segmented-option' + (isSel ? ' selected' : '') +
        '" data-value="' + escapeHtml(vs) + '"' + (isPreview ? ' tabindex="-1"' : '') + a.disabled +
        ' aria-pressed="' + (isSel ? 'true' : 'false') + '">' + lbl + '</button>';
    }).join('');
    return '<div class="input-segmented" role="radiogroup" data-segmented-key="' + escapeHtml(f.key || '') + '">' + buttonsHtml +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value="' + escapeHtml(selected) + '"' + (a.required || '') + '>' +
      '</div>';
  }
  function formSegmentedControl(f, opts) {
    return renderSegmentedControl(f, opts || {}, isPreviewOpts(opts));
  }
  function previewSegmentedControl(f) {
    return renderSegmentedControl(f, {}, true);
  }

  /** Color slider: range con gradient HSL arcoíris (variable = grados hue 0-360).
   *  Útil para selección rápida de hue. Acompañado de un swatch visual del color
   *  actual a la derecha. */
  function renderColorSlider(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var min = f.min != null ? Number(f.min) : 0;
    var max = f.max != null ? Number(f.max) : 360;
    var val = f.defaultValue != null ? Number(f.defaultValue) : Math.round((min + max) / 2);
    return '<div class="input-color-slider">' +
      '<div class="input-color-slider-track">' +
        '<input type="range" class="input-color-slider-range" min="' + min + '" max="' + max + '" step="1" value="' + val + '"' + a.disabled + '>' +
      '</div>' +
      '<span class="input-color-slider-swatch" style="background: hsl(' + val + ', 90%, 55%);" aria-hidden="true"></span>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value="' + val + '"' + (a.required || '') + '>' +
      '</div>';
  }
  function formColorSlider(f, opts) { return renderColorSlider(f, opts || {}, isPreviewOpts(opts)); }
  function previewColorSlider(f) { return renderColorSlider(f, {}, true); }

  /** White balance: slider gradient frío (azul) → cálido (amarillo).
   *  variable = -100 (frío) a +100 (cálido). 0 = balance neutro. */
  function renderWhiteBalance(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var min = f.min != null ? Number(f.min) : -100;
    var max = f.max != null ? Number(f.max) : 100;
    var val = f.defaultValue != null ? Number(f.defaultValue) : 0;
    return '<div class="input-white-balance">' +
      '<div class="input-white-balance-track">' +
        '<input type="range" class="input-white-balance-range" min="' + min + '" max="' + max + '" step="1" value="' + val + '"' + a.disabled + '>' +
      '</div>' +
      '<span class="input-white-balance-value">' + val + '</span>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value="' + val + '"' + (a.required || '') + '>' +
      '</div>';
  }
  function formWhiteBalance(f, opts) { return renderWhiteBalance(f, opts || {}, isPreviewOpts(opts)); }
  function previewWhiteBalance(f) { return renderWhiteBalance(f, {}, true); }

  /** Rotation dial: ruler horizontal con ticks. variable = grados (-180 a 180). */
  function renderRotationDial(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var min = f.min != null ? Number(f.min) : -180;
    var max = f.max != null ? Number(f.max) : 180;
    var val = f.defaultValue != null ? Number(f.defaultValue) : 0;
    return '<div class="input-rotation-dial">' +
      '<div class="input-rotation-dial-ruler" aria-hidden="true"></div>' +
      '<div class="input-rotation-dial-indicator" aria-hidden="true"></div>' +
      '<input type="range" class="input-rotation-dial-range" min="' + min + '" max="' + max + '" step="1" value="' + val + '"' + a.disabled + '>' +
      '<span class="input-rotation-dial-value">' + val + '°</span>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value="' + val + '"' + (a.required || '') + '>' +
      '</div>';
  }
  function formRotationDial(f, opts) { return renderRotationDial(f, opts || {}, isPreviewOpts(opts)); }
  function previewRotationDial(f) { return renderRotationDial(f, {}, true); }

  /** Steps slider: range con markers discretos (steps array). Útil para
   *  configurar valores como steps de difusión IA (1, 10, 25, 50). */
  function renderStepsSlider(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var steps = (Array.isArray(f.steps) && f.steps.length > 0) ? f.steps : [1, 10, 25, 50];
    var defaultVal = f.defaultValue != null ? Number(f.defaultValue) : steps[Math.floor(steps.length / 2)];
    // Index del step más cercano al defaultValue
    var idx = 0, minDiff = Infinity;
    steps.forEach(function (s, i) {
      var d = Math.abs(Number(s) - defaultVal);
      if (d < minDiff) { minDiff = d; idx = i; }
    });
    var markersHtml = steps.map(function (s, i) {
      return '<button type="button" class="input-steps-marker' + (i === idx ? ' selected' : '') +
        '" data-step-index="' + i + '" data-step-value="' + escapeHtml(String(s)) + '"' + (isPreview ? ' tabindex="-1"' : '') + a.disabled + '>' +
        '<span class="input-steps-marker-dot" aria-hidden="true"></span>' +
        '<span class="input-steps-marker-label">' + escapeHtml(String(s)) + '</span>' +
        '</button>';
    }).join('');
    var maxIdx = steps.length - 1;
    return '<div class="input-steps-slider" data-steps="' + escapeHtml(JSON.stringify(steps)) + '" data-steps-key="' + escapeHtml(f.key || '') + '">' +
      '<input type="range" class="input-steps-slider-range" min="0" max="' + maxIdx + '" step="1" value="' + idx + '"' + a.disabled + '>' +
      '<div class="input-steps-slider-markers">' + markersHtml + '</div>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value="' + escapeHtml(String(steps[idx])) + '"' + (a.required || '') + '>' +
      '</div>';
  }
  function formStepsSlider(f, opts) {
    return renderStepsSlider(f, opts || {}, isPreviewOpts(opts));
  }
  function previewStepsSlider(f) {
    return renderStepsSlider(f, {}, true);
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

  /** Checkboxes (selección única): opciones, usuario elige una → variable = valor elegido (ej. cabello = "rubio"). No es boolean. */
  function renderCheckboxesSingle(f, opts, isPreview) {
    var a = isPreview ? { disabled: ' disabled', name: '', id: '', required: '' } : formAttrs(f, opts);
    var optsList = f.options || [{ label: 'Rubio', value: 'rubio' }, { label: 'Negro', value: 'negro' }, { label: 'Castaño', value: 'castaño' }];
    var defVal = f.defaultValue != null ? String(f.defaultValue) : (optsList[0] ? String(optVal(optsList[0])) : '');
    var html = optsList.map(function (o, i) {
      var v = optVal(o);
      var vs = String(v);
      var lbl = escapeHtml(optLabel(o));
      var checked = (defVal === v || defVal === vs) ? ' checked' : '';
      return '<label class="modern-checkbox-wrapper input-checkboxes-single"><input type="radio" name="' + a.name + '" value="' + escapeHtml(vs) + '"' + checked + a.disabled + '><div class="modern-checkbox-box"></div><span>' + lbl + '</span></label>';
    }).join('');
    return '<div class="input-checkboxes-single-group">' + html + '</div>';
  }

  /** Selection checkboxes: varias opciones, usuario puede marcar varias → variable = array de valores. */
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
    // Si el field tiene display_style: 'chips', usar el visual de chips multi
    // en lugar de la lista vertical de checkboxes. La lógica (variable=array)
    // es idéntica — solo cambia el render.
    if ((f.display_style || '').toLowerCase() === 'chips') {
      return renderMultiSelectChips(f, opts || {}, isPreviewOpts(opts));
    }
    return renderSelectionCheckboxes(f, opts || {}, isPreviewOpts(opts));
  }
  function previewCheckboxesSingle(f) {
    return renderCheckboxesSingle(f, {}, true);
  }
  function formCheckboxesSingle(f, opts) {
    return renderCheckboxesSingle(f, opts || {}, isPreviewOpts(opts));
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
  function normalizeHex(hex) {
    var s = (hex || '').toString().trim().replace(/^#/, '');
    if (!/^[0-9A-Fa-f]{6}$/.test(s)) s = '000000';
    return '#' + s;
  }
  function previewColores(f) {
    var maxSel = Math.max(1, Math.min(12, f.max_selections != null ? f.max_selections : 6));
    var selected = f.defaultValue != null
      ? (Array.isArray(f.defaultValue) ? f.defaultValue : String(f.defaultValue).split(',').map(function (s) { return s.trim(); }).filter(Boolean)).map(normalizeHex)
      : [];
    var list = selected.slice(0, maxSel);
    var swatchesHtml = list.map(function (hex) {
      var esc = escapeHtml(hex);
      return '<div class="color-swatch" style="background:' + esc + ';" data-hex="' + esc + '"></div>';
    }).join('');
    var addHtml = list.length < maxSel
      ? '<div class="color-swatch-add-btn" aria-hidden="true"><span>+</span></div>'
      : '';
    return '<div class="input-colors-wrap input-colors-wrap--preview">' + swatchesHtml + addHtml + '</div>';
  }
  function formColores(f, opts) {
    opts = opts || {};
    var a = formAttrs(f, opts);
    var isPreview = isPreviewOpts(opts);
    var maxSel = Math.max(1, Math.min(12, f.max_selections != null ? f.max_selections : 6));
    var selected = f.defaultValue != null
      ? (Array.isArray(f.defaultValue) ? f.defaultValue : String(f.defaultValue).split(',').map(function (s) { return s.trim(); }).filter(Boolean)).map(normalizeHex)
      : [];
    var list = selected.slice(0, maxSel);
    var selectedStr = list.join(',');
    // Cuando no hay defaultValue pero el template trae options con hex colors,
    // mostrar esos options como swatches "sugerencia" (con opacity reducida)
    // para que el preview del canvas/studio no se vea vacío con solo el +.
    var suggested = [];
    if (list.length === 0 && Array.isArray(f.options)) {
      suggested = f.options
        .map(function (o) { return typeof o === 'string' ? o : (o && (o.value || o.hex)); })
        .filter(Boolean)
        .map(normalizeHex)
        .slice(0, maxSel);
    }
    if (isPreview) {
      var previewSwatches = (list.length > 0 ? list : suggested).map(function (hex) {
        var esc = escapeHtml(hex);
        var cls = list.length > 0 ? 'color-swatch' : 'color-swatch color-swatch--suggested';
        return '<div class="' + cls + '" style="background:' + esc + ';" data-hex="' + esc + '"></div>';
      }).join('');
      var previewAdd = list.length < maxSel ? '<div class="color-swatch-add-btn"><span>+</span></div>' : '';
      return '<div class="input-colors-wrap input-colors-wrap--preview">' + previewSwatches + previewAdd + '</div>';
    }
    var swatchesHtml = list.map(function (hex) {
      var esc = escapeHtml(hex);
      return '<div class="color-swatch" style="background:' + esc + ';" data-hex="' + esc + '">' +
        '<button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button></div>';
    }).join('');
    // Swatches sugeridos (template options) si no hay selección — solo visual, no son data
    var suggestedHtml = (list.length === 0)
      ? suggested.map(function (hex) {
          var esc = escapeHtml(hex);
          return '<div class="color-swatch color-swatch--suggested" style="background:' + esc + ';" data-hex="' + esc + '" title="Sugerencia del template"></div>';
        }).join('')
      : '';
    var addBtnHtml = list.length < maxSel
      ? '<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>'
      : '';
    return '<input type="hidden" class="input-colors-value" name="' + escapeHtml(a.name) + '" id="' + escapeHtml(a.id) + '" value="' + escapeHtml(selectedStr) + '" data-max="' + maxSel + '">' +
      '<div class="input-colors-wrap" data-colors-key="' + escapeHtml(f.key || '') + '" data-colors-max="' + maxSel + '" data-colors-brand-style="1" role="group" aria-label="' + escapeHtml(f.label || 'Colores') + '">' + swatchesHtml + suggestedHtml + addBtnHtml + '</div>';
  }

  /** Placeholder para FILE_CONTAINER (upload) */
  function previewFile(f) {
    return '<div class="preview-structural"><i class="ph ph-upload-simple"></i><span>' + escapeHtml(f.label || 'Subir archivo') + '</span></div>';
  }
  function formFile(f, opts) {
    var a = formAttrs(f, opts || {});
    var accept = (f.fileTypes || f.accept || '').trim() || '*';
    var multi = !!f.multiUpload;
    // Drop zone visual: el <input type="file"> queda invisible cubriendo el
    // <label>; clic en cualquier parte del zone dispara el file picker. El
    // <span class="file-input-zone-files"> se actualiza vía JS externo si
    // alguien necesita mostrar nombres (no se requiere para que funcione).
    var acceptLabel = accept === '*' ? 'Cualquier tipo de archivo' : accept;
    var hint = multi ? 'Click o arrastra varios archivos' : 'Click o arrastra un archivo';
    return (
      '<label class="file-input-wrap" for="' + a.id + '">' +
        '<input type="file" class="file-input-native" id="' + a.id + '" name="' + a.name + '" accept="' + escapeHtml(accept) + '"' + (multi ? ' multiple' : '') + a.disabled + '>' +
        '<div class="file-input-zone" aria-hidden="true">' +
          '<i class="ph ph-upload-simple file-input-icon"></i>' +
          '<span class="file-input-hint">' + escapeHtml(hint) + '</span>' +
          '<span class="file-input-accept">' + escapeHtml(acceptLabel) + '</span>' +
        '</div>' +
      '</label>'
    );
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
    // 4 cards skeleton dentro del track: visibles en el canvas del builder
    // hasta que populateImageSelectorCarousels (StudioView) las reemplace por
    // las imágenes reales. Cada card tiene .image-selector-card--skeleton
    // para distinguirlas en CSS y porque el populate las elimina antes de
    // inyectar las cards reales.
    var skeletonCount = 4;
    var skeletons = [];
    for (var i = 0; i < skeletonCount; i++) {
      skeletons.push(
        '<div class="image-selector-card image-selector-card--skeleton" aria-hidden="true">' +
          '<div class="image-selector-card-placeholder"><i class="ph ph-image"></i></div>' +
          '<span class="image-selector-card-label">' + escapeHtml(placeholderLabel) + '</span>' +
        '</div>'
      );
    }
    return '<div class="image-selector-carousel" data-media-source="' + escapeHtml(source) + '" data-selection-mode="' + (multi ? 'multiple' : 'single') + '" data-key="' + escapeHtml(f.key || '') + '" data-field-name="' + escapeHtml(a.name) + '">' +
      '<div class="image-selector-carousel-track image-selector-carousel-track--empty" data-empty-msg="' + escapeHtml(placeholderLabel) + '">' + skeletons.join('') + '</div>' +
      '<input type="hidden" id="' + a.id + '" name="' + a.name + '" value=""' + a.disabled + a.required + '>' +
      '</div>';
  }

  /** Registry de contenedores reales. Cada uno tiene preview + form. */
  var CONTAINER_RENDERERS = {
    STRING_CONTAINER: {
      preview: function (f) {
        var it = getInputType(f);
        if (isContextTemplate(f)) return previewContext(getContextSelectorLabel(it));
        if (it === 'tags') return previewTags(f);
        if (it === 'cron_schedule') return previewCronSchedule(f);
        var multi = f.mode === 'multi_line' || f.mode === 'multiline' || f.mode === 'prompt' || f.is_multiline ||
          (f.input_type && (f.input_type === 'string' && (f.mode === 'multiline' || f.mode === 'multi_line' || f.mode === 'prompt') || f.input_type === 'textarea' || f.input_type === 'prompt_input' || f.input_type === 'prompt_user' || f.input_type === 'prompt_system'));
        return multi ? previewTextarea(f) : previewText(f);
      },
      form: function (f, opts) {
        opts = opts || {};
        if (isContextTemplate(f)) return formContextPlaceholder(f, opts || {}, getContextPlaceholder(getInputType(f)));
        if (getInputType(f) === 'tags') return formTags(f, opts);
        if (getInputType(f) === 'cron_schedule') return formCronSchedule(f, opts);
        var multi = f.mode === 'multi_line' || f.mode === 'multiline' || f.mode === 'prompt' || f.is_multiline ||
          (f.input_type && (f.input_type === 'string' && (f.mode === 'multiline' || f.mode === 'multi_line' || f.mode === 'prompt') || f.input_type === 'textarea' || f.input_type === 'prompt_input' || f.input_type === 'prompt_user' || f.input_type === 'prompt_system'));
        return multi ? formTextarea(f, opts) : formText(f, opts);
      }
    },
    SELECT_CONTAINER: {
      preview: function (f) {
        var t = getInputType(f);
        if (t === 'flags') return previewFlags(f);
        if (t === 'checkboxes') return previewCheckboxesSingle(f);
        if (t === 'selection_checkboxes') return previewSelectionCheckboxes(f);
        var style = f.select_style || (t === 'choice_chips' ? 'choice_chips' : (t === 'multi_select_chips' ? 'multi_select_chips' : 'dropdown'));
        if (style === 'choice_chips') return previewChoiceChips(f);
        if (style === 'multi_select_chips' || f.is_multiple) return previewMultiSelectChips(f);
        return previewSelect(f);
      },
      form: function (f, opts) {
        var t = getInputType(f);
        if (t === 'flags') return formFlags(f, opts);
        if (t === 'checkboxes') return formCheckboxesSingle(f, opts);
        if (t === 'selection_checkboxes') return formSelectionCheckboxes(f, opts);
        var style = f.select_style || (t === 'choice_chips' ? 'choice_chips' : (t === 'multi_select_chips' ? 'multi_select_chips' : 'dropdown'));
        if (style === 'choice_chips') return formChoiceChips(f, opts);
        if (style === 'multi_select_chips' || f.is_multiple) return formMultiSelectChips(f, opts);
        return formSelect(f, opts);
      }
    },
    COLORS_CONTAINER: {
      preview: previewColores,
      form: formColores
    },
    ASPECT_RATIO_CONTAINER: {
      preview: previewAspectRatio,
      form: formAspectRatio
    },
    SCOPE_PICKER_CONTAINER: {
      preview: previewScopePicker,
      form: formScopePicker
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
        /* switch, toggle_switch y boolean (legacy) → interruptor; checkbox (singular) → casilla on/off */
        if (display === 'switch' || display === 'toggle_switch' || display === 'boolean') return previewSwitch(f);
        return previewCheckbox(f);
      },
      form: function (f, opts) {
        var display = (f.display_style || f.display || getInputType(f) || 'checkbox');
        if (display === 'radio' || display === 'radio_buttons') return formRadio(f, opts);
        if (display === 'switch' || display === 'toggle_switch' || display === 'boolean') return formSwitch(f, opts);
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
        // section como container: render real con children y display_style
        if (t === 'section' && (Array.isArray(f.children) || f.display_style)) {
          return renderContainerField(f, {}, true, 'section');
        }
        var labels = { section: 'Sección', divider: 'Divisor', heading: 'Título', description: 'Texto informativo', description_block: 'Texto informativo', accordion: 'Acordeón', tabs: 'Pestañas', repeater: 'Repetidor', group: 'Grupo' };
        var icons = { section: 'square', divider: 'minus', heading: 'type', description: 'align-left', description_block: 'info', accordion: 'caret-double-down', tabs: 'squares-four', repeater: 'repeat', group: 'stack' };
        return previewBlock(labels[t] || f.label || 'Bloque', icons[t] || 'placeholder');
      },
      form: formStructural
    },
    SEGMENTED_CONTAINER: {
      preview: previewSegmentedControl,
      form: formSegmentedControl
    },
    STEPS_SLIDER_CONTAINER: {
      preview: previewStepsSlider,
      form: formStepsSlider
    },
    COLOR_SLIDER_CONTAINER: {
      preview: previewColorSlider,
      form: formColorSlider
    },
    WHITE_BALANCE_CONTAINER: {
      preview: previewWhiteBalance,
      form: formWhiteBalance
    },
    ROTATION_DIAL_CONTAINER: {
      preview: previewRotationDial,
      form: formRotationDial
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
    register('aspect_ratio', { preview: previewAspectRatio, form: formAspectRatio });
    register('tags', { preview: previewTags, form: formTags });
    register('stepper_num', { preview: previewStepper, form: formStepper });
    register('num_stepper', { preview: previewStepper, form: formStepper });
    register('checkboxes', { preview: previewCheckboxesSingle, form: formCheckboxesSingle });
    register('selection_checkboxes', { preview: previewSelectionCheckboxes, form: formSelectionCheckboxes });
    register('toggle_switch', { preview: previewSwitch, form: formSwitch });
    register('slider', { preview: previewRange, form: formRange });
    register('cron_schedule', { preview: previewCronSchedule, form: formCronSchedule });
    register('segmented_control', { preview: previewSegmentedControl, form: formSegmentedControl });
    register('steps_slider', { preview: previewStepsSlider, form: formStepsSlider });
    register('color_slider', { preview: previewColorSlider, form: formColorSlider });
    register('white_balance', { preview: previewWhiteBalance, form: formWhiteBalance });
    register('rotation_dial', { preview: previewRotationDial, form: formRotationDial });

    register('section', {
      preview: function (f) {
        if (Array.isArray(f.children) || f.display_style) {
          return renderContainerField(f, {}, true, 'section');
        }
        return previewBlock('Sección', 'square');
      },
      form: formStructural
    });
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
      { id: 'aspect_ratio', name: 'Aspect ratio', description: 'Formato de producción. Iconos 16x16 (verticales, horizontales, cuadrado).', category: 'basic', icon_name: 'crop', base_schema: { input_type: 'aspect_ratio', type: 'aspect_ratio', data_type: 'string', options: [{ value: '2:3', label: '2:3' }, { value: '3:4', label: '3:4' }, { value: '4:5', label: '4:5' }, { value: '9:16', label: '9:16' }, { value: '3:2', label: '3:2' }, { value: '4:3', label: '4:3' }, { value: '5:4', label: '5:4' }, { value: '16:9', label: '16:9' }, { value: '21:9', label: '21:9' }, { value: '1:1', label: '1:1' }] } },
      { id: 'scope_picker', name: 'Scope picker (enfoque)', description: 'Enfoque de la producción. Toggle «Que la IA decida» y opciones personalizables.', category: 'basic', icon_name: 'target', base_schema: { input_type: 'scope_picker', type: 'scope_picker', data_type: 'object', options: [] } },
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
    if (['string', 'text', 'textarea', 'prompt_input', 'tag_input', 'tags', 'slug_input', 'cron_schedule'].indexOf(t) >= 0) return 'text';
    if (['number'].indexOf(t) >= 0) return 'number';
    if (['range', 'slider'].indexOf(t) >= 0) return 'range';
    if (['stepper_num', 'stepper', 'num_stepper', 'number'].indexOf(t) >= 0) return 'stepper';
    if (['checkbox'].indexOf(t) >= 0) return 'checkbox';
    if (['switch', 'toggle_switch', 'toggle'].indexOf(t) >= 0) return 'switch';
    if (t === 'colores') return 'colores';
    if (t === 'aspect_ratio') return 'aspect_ratio';
    if (t === 'scope_picker') return 'scope_picker';
    if (['select', 'dropdown', 'multi_select', 'radio', 'radio_buttons', 'choice_chips', 'multi_select_chips', 'checkboxes', 'flags', 'tone_selector', 'mood_selector', 'length_selector', 'selection_checkboxes'].indexOf(t) >= 0) return 'select';
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
   * Renderiza un formulario completo desde un array de campos (input_schema).
   * Centraliza la lógica usada por StudioView, DevTestView y Builder.
   * @param {Array<Object>} fields - Campos del schema (key/name, label, input_type, etc.)
   * @param {Object} opts - idPrefix, wrapperClass, showLabel, showHelper, showRequired
   * @returns {string} HTML del formulario
   */
  function renderFormFromSchema(fields, opts) {
    if (!Array.isArray(fields) || fields.length === 0) return '';
    opts = opts || {};
    return fields.map(function (f) {
      var field = f && typeof f === 'object' ? {
        key: f.key || f.name || f.id || 'field',
        name: f.name || f.key || f.id || 'field',
        label: f.label,
        description: f.description,
        required: f.required !== false,
        input_type: f.input_type || f.type,
        type: f.type || f.input_type,
        options: f.options,
        placeholder: f.placeholder,
        default: f.default,
        defaultValue: f.defaultValue !== undefined ? f.defaultValue : f.default
      } : { key: 'field', label: '', required: false };
      return renderFormFieldWithWrapper(field, {
        idPrefix: opts.idPrefix,
        wrapperClass: opts.wrapperClass,
        showLabel: opts.showLabel !== false,
        showHelper: opts.showHelper !== false,
        showRequired: opts.showRequired !== false,
        required: field.required
      });
    }).join('');
  }

  /**
   * Inicializa pickers de color y aspect ratio dentro de un contenedor (formulario ya renderizado).
   */
  function initFormPickers(container) {
    if (!container) return;
    initColorsPicker(container);
    initAspectRatioPicker(container);
    initContainerTabs(container);
    initScopeVeraSwitches(container);
  }

  /** Toggle "Vera" del scope_picker: cuando se marca, el container añade
   *  .is-vera-mode → CSS oculta children y muestra el panel del prompt. */
  function initScopeVeraSwitches(container) {
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll('.scope-vera-input').forEach(function (input) {
      if (input.__veraWired) return;
      input.__veraWired = true;
      input.addEventListener('change', function () {
        var wrap = input.closest('[data-container-type="scope_picker"]');
        if (!wrap) return;
        wrap.classList.toggle('is-vera-mode', input.checked);
      });
    });
  }

  /** Cambia el panel activo cuando el usuario clickea un tab dentro de un
   *  contenedor con display_style:'tabs'. */
  function initContainerTabs(container) {
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll('.input-container--tabs').forEach(function (tabsContainer) {
      var headers = tabsContainer.querySelectorAll('.input-tab-btn');
      var panels = tabsContainer.querySelectorAll('.input-tab-panel');
      headers.forEach(function (btn) {
        if (btn.__tabsWired) return;
        btn.__tabsWired = true;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var key = btn.getAttribute('data-tab-key');
          headers.forEach(function (h) { h.classList.toggle('active', h === btn); });
          panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-tab-key') === key); });
        });
      });
    });
  }

  /**
   * Abre el modal de selección de color delegando a window.ColorPickerModal
   * (js/components/ColorPickerModal.js). Antes había aquí ~150 líneas
   * duplicadas del mixin de marca; ambos consumen ahora el mismo componente.
   *
   * @param {string} initialHex - Hex inicial (ej. #6E3DE9)
   * @param {function(string)} onApply - Callback con el hex elegido
   */
  function openColorPickerModal(initialHex, onApply) {
    if (!window.ColorPickerModal || typeof window.ColorPickerModal.open !== 'function') {
      console.error('[input-registry] window.ColorPickerModal no disponible. Verificar carga de js/components/ColorPickerModal.js.');
      return;
    }
    window.ColorPickerModal.open({ initialHex: initialHex, onApply: onApply });
  }

  /**
   * Inicializa los selectores de colores: estilo Brand Colors (swatch con X + círculo punteado +) o legacy (paleta toggle).
   * @param {Element} root - Contenedor donde buscar (ej. #formFields o document.body)
   */
  function initColorsPicker(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.input-colors-wrap[data-colors-brand-style="1"]').forEach(function (wrap) {
      if (wrap._colorsInit) return;
      wrap._colorsInit = true;
      var max = parseInt(wrap.getAttribute('data-colors-max'), 10) || 6;
      var hidden = wrap.previousElementSibling;
      if (!hidden || !hidden.classList.contains('input-colors-value')) hidden = wrap.parentElement.querySelector('.input-colors-value');
      if (!hidden) return;
      function syncHiddenFromSwatches() {
        var hexes = [];
        wrap.querySelectorAll('.color-swatch[data-hex]').forEach(function (el) {
          hexes.push(el.getAttribute('data-hex'));
        });
        hidden.value = hexes.filter(Boolean).join(',');
        if (hidden.dispatchEvent) hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function bindDelete(swatch) {
        var btn = swatch && swatch.querySelector('.color-delete-btn');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          swatch.remove();
          syncHiddenFromSwatches();
          var addBtn = wrap.querySelector('.color-swatch-add-btn');
          if (!addBtn && wrap.querySelectorAll('.color-swatch').length < max) {
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'color-swatch-add-btn';
            add.title = 'Agregar color';
            add.setAttribute('aria-label', 'Agregar color');
            add.innerHTML = '<span>+</span>';
            wrap.appendChild(add);
            bindAddBtn(add);
          }
        });
      }
      function bindAddBtn(addBtn) {
        addBtn.addEventListener('click', function () {
          var curCount = wrap.querySelectorAll('.color-swatch[data-hex]').length;
          if (curCount >= max) return;
          var lastHex = hidden.value ? (hidden.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).pop()) : null;
          openColorPickerModal(lastHex || '#6E3DE9', function (hex) {
            var norm = normalizeHex(hex);
            var cur = (hidden.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            if (cur.length >= max) return;
            cur.push(norm);
            hidden.value = cur.join(',');
            var div = document.createElement('div');
            div.className = 'color-swatch';
            div.style.background = norm;
            div.setAttribute('data-hex', norm);
            div.innerHTML = '<button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button>';
            var addEl = wrap.querySelector('.color-swatch-add-btn');
            if (addEl) wrap.insertBefore(div, addEl);
            else wrap.appendChild(div);
            bindDelete(div);
            if (wrap.querySelectorAll('.color-swatch').length >= max) {
              var addB = wrap.querySelector('.color-swatch-add-btn');
              if (addB) addB.remove();
            }
            if (hidden.dispatchEvent) hidden.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
      }
      wrap.querySelectorAll('.color-swatch').forEach(bindDelete);
      var addBtn = wrap.querySelector('.color-swatch-add-btn');
      if (addBtn) bindAddBtn(addBtn);
    });
  }

  /**
   * Inicializa los selectores de aspect ratio (iconos/cards seleccionables, sin radios).
   * @param {Element} root - Contenedor donde buscar (ej. #formFields o panel de propiedades)
   */
  function initAspectRatioPicker(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.aspect-ratio-grid[data-aspect-ratio-picker="1"]').forEach(function (grid) {
      if (grid._aspectRatioInit) return;
      grid._aspectRatioInit = true;
      var hidden = grid.previousElementSibling;
      if (!hidden || !hidden.classList.contains('aspect-ratio-value')) hidden = grid.parentElement.querySelector('.aspect-ratio-value');
      if (!hidden) return;
      grid.querySelectorAll('.aspect-ratio-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          var val = btn.getAttribute('data-value');
          if (!val) return;
          hidden.value = val;
          grid.querySelectorAll('.aspect-ratio-card').forEach(function (b) {
            var sel = b.getAttribute('data-value') === val;
            b.classList.toggle('selected', sel);
            b.setAttribute('aria-pressed', sel ? 'true' : 'false');
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
    renderFormFromSchema: renderFormFromSchema,
    initFormPickers: initFormPickers,
    isStructural: isStructural,
    hasOwnLabel: hasOwnLabel,
    getDefaultTemplates: getDefaultTemplates,
    getPropertyFamily: getPropertyFamily,
    escapeHtml: escapeHtml,
    initColorsPicker: initColorsPicker,
    initAspectRatioPicker: initAspectRatioPicker,
    CONTAINER_RENDERERS: CONTAINER_RENDERERS
  };

  global.InputRegistry = InputRegistry;
})(typeof window !== 'undefined' ? window : this);
