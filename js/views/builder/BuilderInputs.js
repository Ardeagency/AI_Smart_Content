/**
 * BuilderInputs — Mixin for DevBuilderView
 * Handles: canvas rendering, drag & drop, field management, properties panel
 */
(function () {
  'use strict';
  const P = DevBuilderView.prototype;

  /** Mapeo de icon_name → ícono Phosphor del subset (css/phosphor-subset.css). Cualquier
   *  ícono que no exista en el subset aquí se rutea a un fallback disponible. */
  const PHOSPHOR_ICON_MAP = {
    // mapeos legacy
    type: 'textbox',
    tags: 'list-bullets',
    placeholder: 'squares-four',
    // íconos comunes de templates que no están en el subset
    'caret-down': 'caret-down',
    'squares-four': 'squares-four',
    'radio-button': 'check-circle',
    'list-checks': 'list-checks',
    'check-square': 'check-circle',
    hash: 'squares-four',
    sliders: 'sliders',
    flag: 'globe',
    palette: 'image',
    crop: 'image',
    target: 'sparkle',
    storefront: 'stack',
    package: 'stack',
    users: 'stack',
    image: 'image',
    microphone: 'note',
    ruler: 'sliders',
    layout: 'squares-four',
    minus: 'list-bullets',
    textbox: 'textbox',
    aperture: 'image',
    'video-camera': 'play',
    mountains: 'image',
    user: 'stack',
    megaphone: 'note',
    'share-network': 'tree-structure',
    database: 'stack',
    shapes: 'squares-four',
    square: 'squares-four',
    // ===== Iconos del nuevo panel de propiedades =====
    'text-aa': 'textbox', 'text-h': 'textbox',
    'toggle-left': 'sliders', 'toggle-right': 'sliders',
    'paint-brush': 'sparkle', 'paint-brush-broad': 'sparkle',
    fingerprint: 'hand-pointing',
    cube: 'stack',
    'arrow-up': 'caret-up', 'arrow-down': 'caret-down',
    'text-align-left': 'list-bullets', 'text-align-center': 'list-bullets',
    'text-align-right': 'list-bullets',
    'arrows-vertical': 'sliders',
    crosshair: 'cursor-click',
    'frame-corners': 'squares-four',
    'image-square': 'image',
    'check-circle': 'check-circle',
    'plus-minus': 'sliders',
    'list-numbers': 'list-bullets',
    sun: 'globe',
    eye: 'magnifying-glass',
    'film-strip': 'play',
    gauge: 'sliders',
    lock: 'wrench',
    path: 'tree-structure',
    'arrow-bend-up-right': 'arrow-right',
    tshirt: 'stack',
    'markdown-logo': 'terminal',
    tabs: 'squares-four',
    rows: 'list-bullets',
    star: 'sparkle',
    'number-square-one': 'textbox',
    paperclip: 'upload-simple',
    'radio-button-fill': 'check-circle',
    smiley: 'check-circle',
    tag: 'list-bullets',
    'link-simple': 'link',
    'storefront-alt': 'stack',
    'wave-sine': 'sliders'
  };

  /** Lista de íconos del subset (CSS phosphor-subset.css) — todo lo demás cae a 'squares-four'. */
  const PHOSPHOR_SUBSET = new Set([
    'arrow-counter-clockwise','arrow-right','arrow-square-out','arrows-clockwise','arrows-out',
    'brackets-curly','cardholder','caret-down','caret-left','caret-right','caret-up','check','check-circle',
    'clock','clock-counter-clockwise','cloud','code','copy','cursor-click','dots-six-vertical','download',
    'eraser','flask','floppy-disk','folder-simple','gear','globe','hand-pointing','heartbeat','image','info',
    'link','list-bullets','list-checks','magnifying-glass','note','pencil','pencil-simple','play','plus',
    'plus-circle','question','robot','sliders','sliders-horizontal','sparkle','spin','spinner','squares-four',
    'stack','terminal','textbox','timer','trash','tree-structure','upload-simple','warning','warning-circle',
    'webhooks-logo','wrench','x','x-circle'
  ]);

  P.getPhosphorIconName = function (iconName) {
    if (!iconName) return 'textbox';
    const mapped = PHOSPHOR_ICON_MAP[iconName] || iconName;
    return PHOSPHOR_SUBSET.has(mapped) ? mapped : 'squares-four';
  };

  // ==================================================================
  // Secciones top-level del rail (patrón Weavy/Segmind). Cada template
  // se asigna a una sección por input_type O por category creativa.
  // ==================================================================
  // Mapeo EXPLÍCITO por name → { section, sub } para templates específicos
  // (la category de la DB está inconsistente: 'colores' en 'scene', 'file' en
  // 'basic', 'flags' en 'protagonist', 'aspect_ratio' en 'distribution'…).
  // Si el name no está aquí, se rutea por category con el fallback de la sección.
  const NAME_PLACEMENT = {
    // Texto
    'string':            { section: 'text',       sub: 'Texto corto' },
    // Tags / hashtags
    'tags':              { section: 'text',       sub: 'Etiquetas' },
    'hashtags_pack':     { section: 'text',       sub: 'Etiquetas' },
    'keyword_enforcer':  { section: 'text',       sub: 'Etiquetas' },
    // Selección
    'dropdown':          { section: 'choice',     sub: 'Desplegable' },
    'choice_chips':      { section: 'choice',     sub: 'Chips' },
    'radio':             { section: 'choice',     sub: 'Radio' },
    'toggle_switch':     { section: 'choice',     sub: 'Switch (on/off)' },
    'selection_checkboxes':{ section: 'choice',   sub: 'Múltiple' },
    'conditional_block': { section: 'choice',     sub: 'Condicional' },
    'flags':             { section: 'choice',     sub: 'Banderas' },
    'segmented_control': { section: 'choice',     sub: 'Segmented' },
    // Aliases para compat con data legacy (si existe)
    'checkboxes':        { section: 'choice',     sub: 'Radio' },
    'multi_select_chips':{ section: 'choice',     sub: 'Múltiple' },
    // Numérico
    'num_stepper':       { section: 'numeric',    sub: 'Número' },
    'range':             { section: 'numeric',    sub: 'Slider' },
    'steps_slider':      { section: 'numeric',    sub: 'Slider con steps' },
    'duration_cap':      { section: 'numeric',    sub: 'Duración / Cantidad' },
    'render_batch_size': { section: 'numeric',    sub: 'Duración / Cantidad' },
    // Visual — selectores únicos visuales
    'colores':           { section: 'visual',     sub: 'Colores' },
    'gradient':          { section: 'visual',     sub: 'Degradado de fondo' },
    'aspect_ratio':      { section: 'visual',     sub: 'Aspect ratio' },
    'scope_picker':      { section: 'visual',     sub: 'Enfoque' },
    'image_selector':    { section: 'visual',     sub: 'Imagen' },
    'file':              { section: 'visual',     sub: 'Archivo' },
    'color_slider':      { section: 'visual',     sub: 'Hue slider' },
    'white_balance':     { section: 'visual',     sub: 'Temperatura' },
    'rotation_dial':     { section: 'visual',     sub: 'Rotación' },
    'position_picker':   { section: 'visual',     sub: 'Punto en cuadrícula' },
    'visual_grid_picker':{ section: 'visual',     sub: 'Cards visuales' },
    'palette_picker':    { section: 'visual',     sub: 'Paletas de color' },
    'logo_picker':       { section: 'data',       sub: 'Plataforma' },
    'thumbnail_picker':  { section: 'visual',     sub: 'Thumbnails' },
    // Audio
    'audio_mood':        { section: 'audio',      sub: 'Mood' },
    'lang_selector':     { section: 'audio',      sub: 'Idioma / Voz' },
    'voice_profile':     { section: 'audio',      sub: 'Idioma / Voz' },
    'music_bpm':         { section: 'audio',      sub: 'Música' },
    'sound_design_notes':{ section: 'audio',      sub: 'Sound design' },
    // Datos
    'brand_selector':    { section: 'data',       sub: 'Marca' },
    'entity_selector':   { section: 'data',       sub: 'Entidades / Productos' },
    'product_selector':  { section: 'data',       sub: 'Entidades / Productos' },
    'audience_selector': { section: 'data',       sub: 'Audiencia' },
    'tone_selector':     { section: 'data',       sub: 'Tono / Longitud' },
    'length_selector':   { section: 'data',       sub: 'Tono / Longitud' },
    'platform_selector': { section: 'data',       sub: 'Plataforma' },
    'cron_schedule':     { section: 'data',       sub: 'Programación' },
    // Branding & Copy
    'headline_slot':     { section: 'branding',   sub: 'Slots de texto' },
    'body_slot':         { section: 'branding',   sub: 'Slots de texto' },
    'brand_positioning': { section: 'branding',   sub: 'Posicionamiento' },
    'message_focus':     { section: 'branding',   sub: 'Posicionamiento' },
    'cta_layering':      { section: 'branding',   sub: 'Posicionamiento' },
    'legal_disclaimer':  { section: 'branding',   sub: 'Legal' },
    'overlay_safe_zone': { section: 'branding',   sub: 'Overlay & Logo' },
    'logo_lockup':       { section: 'branding',   sub: 'Overlay & Logo' },
    // Estructura
    'section':           { section: 'structure',  sub: 'Sección' },
    'divider':           { section: 'structure',  sub: 'Divisor' },
    'heading':           { section: 'structure',  sub: 'Título' },
    'description':       { section: 'structure',  sub: 'Descripción' }
  };

  // Fallback por category cuando el name no está mapeado explícitamente
  const CATEGORY_FALLBACK = {
    style:       { section: 'visual',     sub: 'Estilo & Cámara' },
    motion:      { section: 'visual',     sub: 'Motion & Perspectiva' },
    scene:       { section: 'visual',     sub: 'Escenarios' },
    protagonist: { section: 'visual',     sub: 'Protagonistas' },
    audio:       { section: 'audio',      sub: 'Mood' },
    context:     { section: 'data',       sub: 'Entidades / Productos' },
    controls:    { section: 'choice',     sub: 'Desplegable' },
    branding:    { section: 'branding',   sub: 'Slots de texto' },
    structural:  { section: 'structure',  sub: 'Sección' },
    distribution:{ section: 'data',       sub: 'Plataforma' },
    media:       { section: 'visual',     sub: 'Imagen' },
    preset:      { section: 'templates',  sub: 'Presets completos' },
    basic:       { section: 'text',       sub: 'Texto corto' }
  };

  P.LIBRARY_SECTIONS = [
    {
      key: 'text', name: 'Texto', icon: 'textbox',
      subs: [
        { name: 'Texto corto' },
        { name: 'Texto largo' },
        { name: 'Etiquetas' }
      ]
    },
    {
      key: 'choice', name: 'Selección', icon: 'list-checks',
      subs: [
        { name: 'Desplegable' },
        { name: 'Radio' },
        { name: 'Chips' },
        { name: 'Segmented' },
        { name: 'Múltiple' },
        { name: 'Switch (on/off)' },
        { name: 'Banderas' },
        { name: 'Condicional' }
      ]
    },
    {
      key: 'numeric', name: 'Numérico', icon: 'sliders',
      subs: [
        { name: 'Número' },
        { name: 'Slider' },
        { name: 'Slider con steps' },
        { name: 'Duración / Cantidad' }
      ]
    },
    {
      key: 'visual', name: 'Visual', icon: 'image',
      subs: [
        { name: 'Colores' },
        { name: 'Hue slider' },
        { name: 'Temperatura' },
        { name: 'Rotación' },
        { name: 'Punto en cuadrícula' },
        { name: 'Cards visuales' },
        { name: 'Paletas de color' },
        { name: 'Thumbnails' },
        { name: 'Aspect ratio' },
        { name: 'Imagen' },
        { name: 'Archivo' },
        { name: 'Enfoque' },
        { name: 'Estilo & Cámara' },
        { name: 'Motion & Perspectiva' },
        { name: 'Escenarios' },
        { name: 'Protagonistas' }
      ]
    },
    {
      key: 'audio', name: 'Audio', icon: 'note',
      subs: [
        { name: 'Mood' },
        { name: 'Música' },
        { name: 'Idioma / Voz' },
        { name: 'Sound design' }
      ]
    },
    {
      key: 'data', name: 'Datos', icon: 'stack',
      subs: [
        { name: 'Marca' },
        { name: 'Entidades / Productos' },
        { name: 'Audiencia' },
        { name: 'Tono / Longitud' },
        { name: 'Plataforma' },
        { name: 'Programación' }
      ]
    },
    {
      key: 'branding', name: 'Branding', icon: 'sparkle',
      subs: [
        { name: 'Slots de texto' },
        { name: 'Posicionamiento' },
        { name: 'Legal' },
        { name: 'Overlay & Logo' }
      ]
    },
    {
      key: 'structure', name: 'Estructura', icon: 'list-bullets',
      subs: [
        { name: 'Sección' },
        { name: 'Divisor' },
        { name: 'Título' },
        { name: 'Descripción' }
      ]
    },
    {
      key: 'templates', name: 'Plantillas', icon: 'cardholder',
      subs: [
        { name: 'Presets completos' }
      ]
    }
  ];

  /** Decide en qué sección + sub-sección entra un template.
   *  Prioridad: 1) NAME_PLACEMENT explícito, 2) CATEGORY_FALLBACK, 3) text/Texto corto. */
  P.resolveLibraryPlacement = function (template) {
    const name = (template.name || '').toLowerCase().trim();
    if (NAME_PLACEMENT[name]) return NAME_PLACEMENT[name];
    const cat = (template.category || '').toLowerCase().trim();
    if (CATEGORY_FALLBACK[cat]) return CATEGORY_FALLBACK[cat];
    return { section: 'text', sub: 'Texto corto' };
  };

  P.renderComponentsList = function () {
    const rail = this.querySelector('#componentsRail');
    const container = this.querySelector('#componentsList');
    const title = this.querySelector('#componentsSectionTitle');
    if (!container) return;

    // Estructura: buckets[sectionKey] = { total, subs: Map<subName, [templates]> }
    const buckets = {};
    this.LIBRARY_SECTIONS.forEach(s => {
      buckets[s.key] = { total: 0, subs: new Map() };
      // Preservar orden de subs según LIBRARY_SECTIONS
      s.subs.forEach(sub => buckets[s.key].subs.set(sub.name, []));
    });
    (this.componentTemplates || []).forEach(t => {
      const placement = this.resolveLibraryPlacement(t);
      const bucket = buckets[placement.section];
      if (!bucket) return;
      if (!bucket.subs.has(placement.sub)) bucket.subs.set(placement.sub, []);
      bucket.subs.get(placement.sub).push(t);
      bucket.total += 1;
    });

    // Restaurar sección activa de localStorage (o primera no vacía)
    if (!this._activeLibrarySection) {
      try { this._activeLibrarySection = localStorage.getItem('builderLibrarySection') || null; } catch (_) {}
    }
    let activeKey = this._activeLibrarySection;
    if (!activeKey || !buckets[activeKey] || buckets[activeKey].total === 0) {
      const firstWithItems = this.LIBRARY_SECTIONS.find(s => buckets[s.key].total > 0);
      activeKey = (firstWithItems && firstWithItems.key) || 'text';
    }
    this._activeLibrarySection = activeKey;

    const escapeAttr = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const escapeHtml = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

    // Render rail (solo icono + tooltip, estilo Weavy)
    if (rail) {
      rail.innerHTML = this.LIBRARY_SECTIONS.map(s => {
        const total = buckets[s.key].total;
        if (total === 0) return '';
        const isActive = s.key === activeKey;
        const icon = this.getPhosphorIconName(s.icon);
        return `
          <button type="button"
                  class="components-rail-item ${isActive ? 'is-active' : ''}"
                  data-section="${escapeAttr(s.key)}"
                  title="${escapeAttr(s.name)}"
                  aria-label="${escapeAttr(s.name)}">
            <i class="ph ph-${escapeHtml(icon)}"></i>
          </button>
        `;
      }).join('');
    }

    // Render panel: sub-secciones de la sección activa
    const activeSection = this.LIBRARY_SECTIONS.find(s => s.key === activeKey);
    if (title && activeSection) title.textContent = activeSection.name;
    const activeBucket = buckets[activeKey];

    if (!activeBucket || activeBucket.total === 0) {
      container.innerHTML = `
        <div class="components-empty">
          <i class="aisc-ico aisc-ico--folder"></i>
          <p>Sin componentes en esta sección.</p>
        </div>
      `;
    } else {
      const renderCard = (template) => {
        const searchText = [template.name, template.description].filter(Boolean).join(' ').toLowerCase();
        const iconName = this.getPhosphorIconName(template.icon_name);
        const templateJson = JSON.stringify(template.base_schema).replace(/'/g, '&#39;');
        // Iconos especiales custom (no Phosphor) por name de template
        const iconHtml = (template.name === 'heading')
          ? '<span class="component-icon-h">H1</span>'
          : `<i class="ph ph-${escapeHtml(iconName)}"></i>`;
        return `
          <div class="component-item"
               draggable="true"
               data-template-id="${escapeAttr(template.id)}"
               data-template="${escapeAttr(templateJson)}"
               data-search="${escapeAttr(searchText)}"
               title="${escapeAttr(template.description || template.name)}">
            ${iconHtml}
            <span class="component-name">${escapeHtml(template.name).replace(/_/g, '_<wbr>')}</span>
          </div>
        `;
      };

      const subBlocks = [];
      activeBucket.subs.forEach((items, subName) => {
        if (!items || items.length === 0) return;
        subBlocks.push(`
          <div class="components-subsection" data-sub="${escapeAttr(subName)}">
            <div class="components-subsection-title">${escapeHtml(subName)}</div>
            <div class="components-section-grid">${items.map(renderCard).join('')}</div>
          </div>
        `);
      });
      container.innerHTML = subBlocks.join('');
    }

    this.setupRailListeners(buckets);
    this.setupComponentsSearch();
    this.setupDragAndDrop();
  };

  /** Click en un ítem del rail cambia la sección activa y re-renderiza el panel. */
  P.setupRailListeners = function (buckets) {
    const rail = this.querySelector('#componentsRail');
    if (!rail) return;
    rail.querySelectorAll('.components-rail-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-section');
        if (!key || key === this._activeLibrarySection) return;
        if (buckets && (!buckets[key] || buckets[key].length === 0)) return;
        this._activeLibrarySection = key;
        try { localStorage.setItem('builderLibrarySection', key); } catch (_) {}
        this.renderComponentsList();
      });
    });
  };

  P.setupComponentsSearch = function () {
    const input = this.querySelector('#componentsSearchInput');
    const container = this.querySelector('#componentsList');
    if (!input || !container) return;

    const filter = () => {
      const q = (input.value || '').trim().toLowerCase();
      let totalVisible = 0;
      container.querySelectorAll('.components-subsection').forEach(sub => {
        const items = sub.querySelectorAll('.component-item');
        let subVisible = 0;
        items.forEach(item => {
          const search = (item.getAttribute('data-search') || '').trim();
          const show = !q || search.includes(q);
          item.classList.toggle('component-item-hidden', !show);
          if (show) subVisible++;
        });
        sub.classList.toggle('components-subsection-hidden', subVisible === 0);
        totalVisible += subVisible;
      });
      // Mensaje global "Sin resultados" si todo se filtró
      let emptyMsg = container.querySelector('.components-search-empty');
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'components-search-empty components-empty';
        emptyMsg.innerHTML = '<i class="aisc-ico aisc-ico--search"></i><p>Sin resultados</p>';
        emptyMsg.hidden = true;
        container.appendChild(emptyMsg);
      }
      emptyMsg.hidden = !(q && totalVisible === 0);
    };

    input.addEventListener('input', filter);
    input.addEventListener('change', filter);
  };

  P.setupDragAndDrop = function () {
    // Componentes arrastrables (el panel se re-renderiza al cambiar de sección
    // del rail, así que estos listeners SÍ se attachan cada vez sobre nodos
    // nuevos del DOM — no se duplican).
    const components = this.querySelectorAll('.component-item');
    components.forEach(comp => {
      comp.addEventListener('dragstart', (e) => this.handleComponentDragStart(e));
      comp.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });

    // Canvas como drop zone: flag para no duplicar listeners (el #builderCanvas
    // es DOM estable, sobrevive a los re-renders).
    const canvas = this.querySelector('#builderCanvas');
    if (canvas && !canvas.__dropWired) {
      canvas.__dropWired = true;
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
    const canvas = this.querySelector('#builderCanvas');
    canvas?.classList.add('drag-over');
    // Highlight del container body bajo el cursor (si lo hay)
    const containerBody = e.target.closest(
      '.input-container-body, .input-accordion-body, .input-tab-panel, .input-container--empty, .input-container-empty-msg'
    );
    canvas?.querySelectorAll('.drop-target-container').forEach(el => {
      if (el !== containerBody) el.classList.remove('drop-target-container');
    });
    if (containerBody) containerBody.classList.add('drop-target-container');
  };

  P.handleDragLeave = function (e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const canvas = this.querySelector('#builderCanvas');
      canvas?.classList.remove('drag-over');
      canvas?.querySelectorAll('.drop-target-container').forEach(el => el.classList.remove('drop-target-container'));
    }
  };

  P.handleDrop = function (e) {
    e.preventDefault();
    const canvas = this.querySelector('#builderCanvas');
    canvas?.classList.remove('drag-active', 'drag-over');
    // Limpiar drop-target highlights de containers
    canvas?.querySelectorAll('.drop-target-container').forEach(el => el.classList.remove('drop-target-container'));

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));

      if (data.type === 'new_component') {
        // Drop dentro de un container: el body, accordion-body, tab-panel
        // o el empty-msg de un container vacío. Subimos al ancestro con
        // data-container-key para obtener la key del container destino.
        const containerEl = e.target.closest(
          '.input-container-body, .input-accordion-body, .input-tab-panel, .input-container--empty, .input-container-empty-msg'
        );
        let containerKey = null;
        if (containerEl) {
          containerKey = containerEl.getAttribute('data-container-key');
          if (!containerKey) {
            const ancestor = containerEl.closest('[data-container-key]');
            if (ancestor) containerKey = ancestor.getAttribute('data-container-key');
          }
        }
        this.addField(data.templateId, data.templateData, containerKey);
      } else if (data.type === 'reorder') {
        // Reordenamiento de campos existentes (solo root por ahora)
        this.reorderField(data.fromIndex, this.getDropIndex(e));
      }
    } catch (err) {
      console.error('Error handling drop:', err);
    }
  };

  /** Resolución recursiva: dado un `key` de container, devuelve el array
   *  `children` correspondiente dentro del inputSchema. Si no se encuentra
   *  o no hay key, devuelve el root inputSchema. */
  P.findContainerChildrenArray = function (containerKey) {
    if (!containerKey) return this.getCanvasFields();
    const root = this.getCanvasFields();
    const isContainer = (f) => ['section', 'scope_picker'].indexOf(f && f.input_type) >= 0;
    const search = (arr) => {
      for (const f of arr) {
        if (!f || typeof f !== 'object') continue;
        if (f.key === containerKey && isContainer(f)) {
          if (!Array.isArray(f.children)) f.children = [];
          return f.children;
        }
        if (Array.isArray(f.children)) {
          const found = search(f.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(root) || root;
  };

  P.addField = function (templateId, templateDataFromDrag, containerKey) {
    const template = this.componentTemplates.find(t => String(t.id) === String(templateId));
    // Deep clone para que options/flags_category/etc. no se compartan por referencia entre plantilla y campo
    const cloneDeep = (o) => {
      if (o == null) return {};
      try { return JSON.parse(JSON.stringify(o)); } catch (_) { return { ...o }; }
    };
    const baseSchema = template?.base_schema && typeof template.base_schema === 'object'
      ? cloneDeep(template.base_schema)
      : (templateDataFromDrag && typeof templateDataFromDrag === 'object' ? cloneDeep(templateDataFromDrag) : {});
    const defaultUi = template?.default_ui_config && typeof template.default_ui_config === 'object' ? cloneDeep(template.default_ui_config) : {};
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
        ...defaultUi,
        width: defaultUi.width != null ? defaultUi.width : 'full',
        hidden: defaultUi.hidden != null ? defaultUi.hidden : false
      }
    };
    // Si el field nuevo es a su vez container, inicializar children
    if (newField.input_type === 'section' || newField.input_type === 'scope_picker') {
      if (!Array.isArray(newField.children)) newField.children = [];
      if (!newField.display_style) newField.display_style = 'flat';
    }

    // Resolver dónde insertar: dentro de un container (drop sobre él) o en root
    const targetArr = this.findContainerChildrenArray(containerKey);
    targetArr.push(newField);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.updateJsonPreview();

    // Solo seleccionar si insertamos en root (los children no tienen overlay
    // de edición todavía en Fase 2A — Fase 2B lo añadirá)
    if (!containerKey) {
      this.selectField(targetArr.length - 1);
    }
  };

  /** Sanitiza una key candidata: lowercase, [^a-z0-9_]→'_', sin dobles/leading/trailing _.
   *  Si empieza con dígito, prefija 'f_' (claves JSONPath/REST inválidas si empiezan con número).
   *  Reservada: si queda vacía, devuelve 'campo'. */
  P.sanitizeKey = function (raw) {
    let s = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (!s) s = 'campo';
    if (/^[0-9]/.test(s)) s = 'f_' + s;
    return s;
  };

  P.generateFieldKey = function (baseName, excludeIndex) {
    const base = this.sanitizeKey(baseName);
    const fields = this.getCanvasFields();
    const isDuplicate = (candidate) => fields.some((f, i) => f.key === candidate && i !== (excludeIndex != null ? excludeIndex : -1));
    let key = base;
    let counter = 1;
    while (isDuplicate(key)) {
      key = `${base}_${counter}`;
      counter++;
    }
    return key;
  };

  P.reorderField = function (fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    
    const arr = this.getCanvasFields();
    const [field] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, field);
    
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    
    if (this.selectedFieldIndex === fromIndex) {
      this.selectedFieldIndex = toIndex;
    }
  };

  P.getDropIndex = function (e) {
    const fields = this.querySelectorAll('.canvas-field');
    const len = this.getCanvasFields().length;
    let index = len;

    fields.forEach((field, i) => {
      const rect = field.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      if (e.clientY < midY && index === len) {
        index = i;
      }
    });
    
    return index;
  };

  /** Campos del canvas: siempre input_schema del primer módulo (manual = inputs, automated = programación). */
  P.getCanvasFields = function () {
    return this.inputSchema;
  };

  /** Renderiza el canvas con el MISMO formato que studio (InputRegistry.renderFormFromSchema
   *  + initFormPickers), y le añade un overlay de edición que aparece en hover sobre cada
   *  field. Si el flow es autopilot/scraping, envuelve todo en un wrap con el bg del flow
   *  (mismo patrón que studioAutomatedWrap). */
  P.renderCanvas = function () {
    const canvas = this.querySelector('#canvasFields');
    const builderCanvas = this.querySelector('#builderCanvas');
    const emptyState = this.querySelector('#canvasEmptyState');
    const fields = this.getCanvasFields();
    if (!canvas) return;

    const type = (this.flowData && this.flowData.flow_category_type) || 'manual';
    const isAutomated = (type === 'autopilot');

    // Aplicar/quitar wrap automated en el #builderCanvas
    if (builderCanvas) {
      builderCanvas.classList.toggle('builder-canvas--automated', isAutomated);
      if (isAutomated && this.flowData && this.flowData.flow_image_url) {
        const safeUrl = String(this.flowData.flow_image_url).replace(/"/g, '\\"');
        builderCanvas.style.setProperty('--canvas-flow-bg', `url("${safeUrl}")`);
      } else {
        builderCanvas.style.removeProperty('--canvas-flow-bg');
      }
    }

    if (fields.length === 0) {
      canvas.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    canvas.style.display = '';
    if (emptyState) emptyState.style.display = 'none';

    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      canvas.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'canvas-preview-',
        wrapperClass: 'studio-field canvas-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      // Por field generado: meter data-index, draggable y overlay con botones de edición
      const generated = canvas.querySelectorAll('.canvas-field');
      generated.forEach((el, i) => {
        const field = fields[i] || {};
        el.setAttribute('data-index', String(i));
        el.setAttribute('draggable', 'true');
        if (this.selectedFieldIndex === i) el.classList.add('selected');
        const typeLbl = (field.input_type || field.type) === 'colores'
          ? `colores (máx. ${field.max_selections != null ? field.max_selections : 6})`
          : (field.input_type || field.type || 'text');
        const overlay = document.createElement('div');
        overlay.className = 'canvas-field-overlay';
        overlay.innerHTML = `
          <span class="canvas-field-grip" title="Arrastra para reordenar"><i class="aisc-ico aisc-ico--more"></i></span>
          <span class="canvas-field-meta">
            <span class="canvas-field-meta-label">${this.escapeHtml(field.label || field.key || '')}</span>
            <span class="canvas-field-meta-type">${this.escapeHtml(typeLbl)}</span>
          </span>
          <span class="canvas-field-actions">
            <button type="button" class="field-action-btn duplicate-field" title="Duplicar" aria-label="Duplicar"><i class="aisc-ico aisc-ico--copy"></i></button>
            <button type="button" class="field-action-btn delete-field" title="Eliminar" aria-label="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
          </span>
        `;
        el.prepend(overlay);
      });
      if (Registry.initFormPickers) Registry.initFormPickers(canvas);
    } else {
      // Fallback: render legacy si Registry no cargó
      canvas.innerHTML = fields.map((field, index) => this.renderCanvasFieldLegacy(field, index)).join('');
    }

    this.enableCanvasPreviewInputs(canvas);
    this.setupCanvasFieldListeners();
  };

  /** Habilita interacción en los controles del canvas (escribir en string, elegir en dropdown, etc.) */
  P.enableCanvasPreviewInputs = function (container) {
    if (!container) return;
    container.querySelectorAll('.canvas-field input, .canvas-field select, .canvas-field textarea').forEach(el => {
      el.removeAttribute('disabled');
      el.style.cursor = el.tagName === 'SELECT' ? 'pointer' : 'text';
    });
  };

  /** Fallback legacy (solo si InputRegistry no está disponible). */
  P.renderCanvasFieldLegacy = function (field, index) {
    const isSelected = this.selectedFieldIndex === index;
    const inputPreview = this.renderInputPreview(field);
    const typeLbl = (field.input_type || field.type) === 'colores'
      ? `colores (máx. ${field.max_selections != null ? field.max_selections : 6})`
      : (field.input_type || field.type || 'text');
    return `
      <div class="canvas-field ${isSelected ? 'selected' : ''}" data-index="${index}" draggable="true">
        <div class="canvas-field-overlay">
          <span class="canvas-field-grip"><i class="aisc-ico aisc-ico--more"></i></span>
          <span class="canvas-field-meta">
            <span class="canvas-field-meta-label">${this.escapeHtml(field.label || field.key || '')}</span>
            <span class="canvas-field-meta-type">${this.escapeHtml(typeLbl)}</span>
          </span>
          <span class="canvas-field-actions">
            <button type="button" class="field-action-btn duplicate-field" title="Duplicar"><i class="aisc-ico aisc-ico--copy"></i></button>
            <button type="button" class="field-action-btn delete-field" title="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
          </span>
        </div>
        <div class="canvas-field-preview">${inputPreview}</div>
      </div>
    `;
  };

  /** Compatibilidad: alias que algunos call-sites antiguos podrían usar */
  P.renderCanvasField = function (field, index) { return this.renderCanvasFieldLegacy(field, index); };

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

  // Delegación: TODOS los listeners van al contenedor estable #canvasFields una sola vez.
  // Al re-renderizar (innerHTML = ...), los handlers del padre siguen vivos. Cero memory leak.
  P.setupCanvasFieldListeners = function () {
    const root = this.querySelector('#canvasFields');
    if (!root || root.__listenersWired) return;
    root.__listenersWired = true;

    const getIndex = (el) => {
      const field = el && el.closest && el.closest('.canvas-field');
      if (!field) return -1;
      const i = parseInt(field.dataset.index, 10);
      return Number.isFinite(i) ? i : -1;
    };

    // 1. Click → seleccionar field o botones de acción del overlay
    root.addEventListener('click', (e) => {
      const dup = e.target.closest('.duplicate-field');
      if (dup) {
        e.preventDefault(); e.stopPropagation();
        const i = getIndex(dup);
        if (i >= 0) this.duplicateField(i);
        return;
      }
      const del = e.target.closest('.delete-field');
      if (del) {
        e.preventDefault(); e.stopPropagation();
        const i = getIndex(del);
        if (i >= 0) this.deleteField(i);
        return;
      }
      // Interactivos del preview: NO seleccionar (escribir/elegir no debe robar foco)
      if (e.target.closest('input, select, textarea, button, .color-swatch, .ratio-option, .image-thumb, .focus-tab')) {
        e.stopPropagation();
        return;
      }
      const i = getIndex(e.target);
      if (i >= 0) this.selectField(i);
    });

    // 2. Drag para reordenar fields
    root.addEventListener('dragstart', (e) => {
      const field = e.target.closest && e.target.closest('.canvas-field');
      if (!field) return;
      const i = getIndex(field);
      if (i < 0) return;
      this.draggedFieldIndex = i;
      try {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'reorder', fromIndex: i }));
      } catch (_) {}
      field.classList.add('dragging');
    });

    root.addEventListener('dragend', (e) => {
      const field = e.target.closest && e.target.closest('.canvas-field');
      if (field) field.classList.remove('dragging');
      this.draggedFieldIndex = null;
    });

    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      const field = e.target.closest && e.target.closest('.canvas-field');
      if (!field) return;
      const i = getIndex(field);
      if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== i) {
        field.classList.add('drag-target');
      }
    });

    root.addEventListener('dragleave', (e) => {
      const field = e.target.closest && e.target.closest('.canvas-field');
      if (field) field.classList.remove('drag-target');
    });

    root.addEventListener('drop', (e) => {
      // Distinguir entre reorder (drag desde otro canvas-field) y new_component
      // (drag desde la biblioteca de la izquierda). Solo consumimos el evento
      // si es REORDER — los new_component deben burbujear al #builderCanvas
      // para que handleDrop los procese.
      let payload = null;
      try { payload = JSON.parse(e.dataTransfer.getData('text/plain') || 'null'); } catch (_) {}
      if (payload && payload.type === 'reorder') {
        e.preventDefault();
        e.stopPropagation();
        const field = e.target.closest && e.target.closest('.canvas-field');
        if (!field) return;
        field.classList.remove('drag-target');
        const i = getIndex(field);
        if (this.draggedFieldIndex !== null && this.draggedFieldIndex !== i && i >= 0) {
          this.reorderField(this.draggedFieldIndex, i);
        }
      }
      // Si es new_component → no stopPropagation, dejar que #builderCanvas lo maneje
    });

    // 3. Sync de inputs internos → defaultValue del schema (delegado a input/change que burbujean)
    const handleSync = (e) => {
      const el = e.target;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA')) return;
      const i = getIndex(el);
      if (i < 0) return;
      const schemaField = this.getCanvasFields()[i];
      if (!schemaField) return;
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      if (type === 'range') {
        schemaField.defaultValue = parseFloat(el.value);
        const field = el.closest('.canvas-field');
        const span = el.nextElementSibling || (field && field.querySelector('.range-value'));
        if (span) span.textContent = el.value;
      } else if (type === 'number') {
        const n = parseFloat(el.value);
        schemaField.defaultValue = isNaN(n) ? undefined : n;
      } else if (type === 'checkbox') {
        schemaField.defaultValue = el.checked;
      } else if (tag === 'select') {
        schemaField.defaultValue = el.value === '' ? undefined : el.value;
      } else {
        schemaField.defaultValue = el.value;
      }
      this.onFieldChange();
      if (this.selectedFieldIndex === i) this.renderPropertiesPanel();
    };
    root.addEventListener('input', handleSync);
    root.addEventListener('change', handleSync);
  };

  // Catálogo agrupado de input_types disponibles para el select "Tipo de control".
  // Sincronizado con los ~75 input_types reales de ui_component_templates en Supabase.
  P.INPUT_TYPE_GROUPS = [
    {
      label: 'Básicos',
      items: [
        ['text',      'Texto corto'],
        ['textarea',  'Texto largo'],
        ['tags',      'Etiquetas / hashtags'],
        ['number',    'Número'],
        ['num_stepper','Número (stepper)'],
        ['range',     'Slider'],
        ['steps_slider','Slider con steps discretos'],
        ['file',      'Archivo']
      ]
    },
    {
      label: 'Selección',
      items: [
        ['dropdown',             'Desplegable (1 opción)'],
        ['radio',                'Radio (1 opción)'],
        ['choice_chips',         'Chips (1 opción)'],
        ['segmented_control',    'Segmented (2-4 pills)'],
        ['selection_checkboxes', 'Múltiple (array)'],
        ['toggle_switch',        'Switch on/off'],
        ['flags',                'Banderas (idioma/país/etnia)'],
        ['conditional_block',    'Bloque condicional']
      ]
    },
    {
      label: 'Visual',
      items: [
        ['colores',         'Colores (círculos)'],
        ['gradient',        'Degradado de fondo (2-4 paradas + dirección)'],
        ['color_slider',    'Hue slider (rainbow)'],
        ['white_balance',   'Temperatura (frío↔cálido)'],
        ['rotation_dial',   'Rotación (dial ticks)'],
        ['position_picker', 'Punto en cuadrícula (3×3)'],
        ['visual_grid_picker','Cards visuales (SVG por opción)'],
        ['palette_picker',  'Paleta de colores (franja)'],
        ['logo_picker',     'Logos de plataforma'],
        ['thumbnail_picker','Thumbnails (gradient/imagen)'],
        ['aspect_ratio',    'Aspect ratio'],
        ['image_selector',  'Selector de imagen'],
        ['scope_picker',    'Enfoque producción'],
        ['focus_selector',  'Selector de enfoque']
      ]
    },
    {
      label: 'Datos / Contexto',
      items: [
        ['brand_selector',    'Selector de marca'],
        ['entity_selector',   'Selector de entidad'],
        ['product_selector',  'Selector de producto'],
        ['audience_selector', 'Selector de audiencia'],
        ['tone_selector',     'Tono'],
        ['length_selector',   'Longitud'],
        ['platform_selector', 'Plataforma'],
        ['cron_schedule',     'Programación (cron)'],
        ['duration_cap',      'Duración tope'],
        ['render_batch_size', 'Tamaño de lote']
      ]
    },
    {
      label: 'Audio',
      items: [
        ['audio_mood',          'Mood de audio'],
        ['music_bpm',           'BPM música'],
        ['voice_profile',       'Perfil de voz'],
        ['lang_selector',       'Idioma'],
        ['sound_design_notes',  'Sound design']
      ]
    },
    {
      label: 'Branding & Copy',
      items: [
        ['headline_slot',     'Slot de titular'],
        ['body_slot',          'Slot de cuerpo'],
        ['brand_positioning',  'Posicionamiento'],
        ['message_focus',      'Foco de mensaje'],
        ['cta_layering',       'CTA layering'],
        ['legal_disclaimer',   'Disclaimer legal'],
        ['overlay_safe_zone',  'Safe zone overlay'],
        ['logo_lockup',        'Logo lockup']
      ]
    },
    {
      label: 'Estilo & Cámara',
      items: [
        ['camera_angle',          'Ángulo de cámara'],
        ['shot_type',             'Tipo de toma'],
        ['lens_focal_length',     'Lente / focal'],
        ['depth_of_field',        'Profundidad de campo'],
        ['composition_structure', 'Composición'],
        ['lighting_style',        'Estilo de luz'],
        ['color_grade_preset',    'Color grade'],
        ['contrast_level',        'Contraste'],
        ['saturation_level',      'Saturación'],
        ['grain_amount',          'Grano'],
        ['glow_amount',           'Glow'],
        ['finish_type',           'Acabado'],
        ['floating_product',      'Producto flotante']
      ]
    },
    {
      label: 'Motion & Perspectiva',
      items: [
        ['camera_movement',       'Movimiento de cámara'],
        ['camera_path',           'Trayectoria'],
        ['camera_roll',           'Camera roll'],
        ['focus_pull',            'Focus pull'],
        ['shot_speed',            'Velocidad'],
        ['frame_rate_style',      'Frame rate'],
        ['motion_style_video',    'Estilo motion'],
        ['zoom_behavior',         'Zoom'],
        ['loop_behavior',         'Loop'],
        ['parallax_layers',       'Parallax'],
        ['perspective_grid',      'Grid perspectiva'],
        ['transition_anchor',     'Anchor transición'],
        ['vanishing_point_bias',  'Punto de fuga']
      ]
    },
    {
      label: 'Escenarios / Protagonistas',
      items: [
        ['background_type',     'Tipo de fondo'],
        ['environment_theme',   'Tema ambiental'],
        ['emotion_profile',     'Emoción'],
        ['ethnicity_profile',   'Etnia'],
        ['eye_color',           'Color de ojos'],
        ['hair_color',          'Color de cabello'],
        ['hair_style',          'Peinado'],
        ['pose_direction',      'Pose'],
        ['wardrobe_style',      'Vestuario']
      ]
    },
    {
      label: 'Estructura',
      items: [
        ['section',     'Sección'],
        ['divider',     'Divisor'],
        ['heading',     'Título'],
        ['description', 'Descripción']
      ]
    }
  ];

  // Tipos que aceptan options [{value, label}]. Si se cambia entre dos de este set,
  // las options se preservan. Si se cambia hacia/desde un tipo que NO los usa, se
  // limpian las options/min/max/step que ya no aplican.
  const TYPES_WITH_OPTIONS = new Set([
    'dropdown','select','radio','checkboxes','selection_checkboxes',
    'choice_chips','multi_select_chips','flags','colores','aspect_ratio',
    'segmented_control','visual_grid_picker','position_picker',
    'palette_picker','logo_picker','thumbnail_picker'
  ]);
  const TYPES_WITH_STEPS = new Set(['steps_slider']);
  const TYPES_WITH_RANGE = new Set(['range','num_stepper','number','color_slider','white_balance','rotation_dial']);
  const TYPES_ARRAY_DATA = new Set(['selection_checkboxes','multi_select_chips','colores']);
  const TYPES_BOOLEAN_DATA = new Set(['checkbox','toggle_switch']);
  const TYPES_NUMBER_DATA  = new Set(['range','number','num_stepper']);

  /** Sanitiza un field al cambiar input_type:
   *  - Preserva options cuando ambos tipos las usan
   *  - Limpia min/max/step/data_type/max_selections/flag_category/display_style
   *    que ya no aplican al nuevo tipo
   *  - Resetea defaultValue si su shape es incompatible con el nuevo tipo
   *  - Aplica defaults solo cuando faltan
   */
  P.applyInputTypeChange = function (field, newType) {
    const oldType = (field.input_type || field.type || '').toLowerCase();
    if (newType === oldType) return;

    field.input_type = newType;
    field.type = newType;

    // 1. options: limpiar si el nuevo tipo no las usa
    if (!TYPES_WITH_OPTIONS.has(newType)) {
      delete field.options;
    }
    // 1b. steps: limpiar si el nuevo tipo no es steps_slider
    if (!TYPES_WITH_STEPS.has(newType)) {
      delete field.steps;
    }
    // 1c. children / display_style: limpiar si el nuevo tipo no es container
    if (!TYPES_CONTAINER.has(newType)) {
      delete field.children;
      // display_style se preserva si aplica (toggle_switch, checkboxes single)
      // y se limpia si era 'flat'/'accordion'/'tabs'/'bordered' (containers-only)
      if (['flat','accordion','tabs','bordered'].indexOf(field.display_style) >= 0) {
        delete field.display_style;
      }
    }
    // 1d. vera_prompt: solo aplica a scope_picker
    if (newType !== 'scope_picker') {
      delete field.vera_prompt;
    }

    // 2. min/max/step: limpiar si el nuevo tipo no es numérico/range
    if (!TYPES_WITH_RANGE.has(newType)) {
      delete field.min; delete field.max; delete field.step;
    }
    // 2b. suffix: solo aplica a range con display_style range_dual/tooltip
    if (newType !== 'range') {
      delete field.suffix;
    }
    // 2c. markdown: solo aplica a description estructural
    if (newType !== 'description') {
      delete field.markdown;
    }
    // 2d. colors: solo aplica a palette_picker (options[].colors se preserva,
    //     pero campo top-level field.colors no aplica a otros tipos)
    if (newType !== 'palette_picker') {
      delete field.colors;
    }
    // 2e. logo / thumbnail / icon top-level no aplican (van en options[])
    if (newType !== 'logo_picker') delete field.logo;
    if (newType !== 'thumbnail_picker') delete field.thumbnail;

    // 3. propiedades específicas que dejan de aplicar
    if (newType !== 'colores') {
      delete field.max_selections;
    }
    if (newType !== 'flags') {
      delete field.flag_category;
      delete field.flags_category;
    }
    // display_style se preserva si el nuevo tipo lo usa. Tipos que usan display_style:
    //  - toggle_switch / switch / selection_checkboxes (variantes del control)
    //  - range (simple / tooltip / range_dual)
    //  - section / scope_picker (flat / accordion / tabs / bordered) — ya cubierto arriba
    var TYPES_WITH_DISPLAY_STYLE = new Set([
      'toggle_switch','switch','selection_checkboxes','range',
      'section','scope_picker'
    ]);
    if (!TYPES_WITH_DISPLAY_STYLE.has(newType)) {
      delete field.display_style;
    }
    if (newType !== 'colores' && !TYPES_ARRAY_DATA.has(newType)) {
      delete field.data_type;
    }

    // 4. defaultValue: resetear si el shape ya no encaja con el target
    const dv = field.defaultValue;
    if (dv !== undefined && dv !== null) {
      if (TYPES_ARRAY_DATA.has(newType) && !Array.isArray(dv)) {
        delete field.defaultValue;
      } else if (TYPES_BOOLEAN_DATA.has(newType) && typeof dv !== 'boolean') {
        delete field.defaultValue;
      } else if (TYPES_NUMBER_DATA.has(newType) && typeof dv !== 'number') {
        const n = parseFloat(dv);
        if (Number.isFinite(n)) field.defaultValue = n;
        else delete field.defaultValue;
      } else if (!TYPES_WITH_OPTIONS.has(newType) && !TYPES_NUMBER_DATA.has(newType) && !TYPES_BOOLEAN_DATA.has(newType) && !TYPES_ARRAY_DATA.has(newType)) {
        if (typeof dv !== 'string') field.defaultValue = String(dv);
      }
    }

    // 5. defaults por tipo (solo si los campos faltan)
    if (newType === 'dropdown' || newType === 'select') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
      }
    }
    if (newType === 'radio' || newType === 'choice_chips') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
      }
    }
    if (newType === 'multi_select_chips' || newType === 'selection_checkboxes') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [{ value: '1', label: 'Opción 1' }, { value: '2', label: 'Opción 2' }];
      }
      if (newType === 'selection_checkboxes') field.display_style = 'selection_checkboxes';
    }
    if (newType === 'checkboxes') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [{ value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }];
      }
    }
    if (newType === 'num_stepper' || newType === 'number') {
      if (field.min == null) field.min = 0;
      if (field.max == null) field.max = 100;
      if (field.step == null) field.step = 1;
      if (field.defaultValue == null) field.defaultValue = 0;
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
        field.options = [
          { value: '#000000', label: 'Negro' }, { value: '#ef4444', label: 'Rojo' },
          { value: '#22c55e', label: 'Verde' }, { value: '#3b82f6', label: 'Azul' },
          { value: '#eab308', label: 'Amarillo' }, { value: '#8b5cf6', label: 'Violeta' }
        ];
      }
    }
    if (newType === 'aspect_ratio') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = ['2:3','3:4','4:5','9:16','3:2','4:3','5:4','16:9','21:9','1:1']
          .map(v => ({ value: v, label: v }));
      }
      if (field.defaultValue == null) field.defaultValue = '1:1';
    }
    if (newType === 'scope_picker') {
      if (!Array.isArray(field.options)) field.options = [];
    }
    if (newType === 'toggle_switch' || newType === 'switch') {
      field.display_style = 'switch';
      if (field.defaultValue == null) field.defaultValue = false;
    }
    if (newType === 'checkbox') {
      if (field.defaultValue == null) field.defaultValue = false;
    }
    if (newType === 'segmented_control') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [{ value: 'opcion1', label: 'Opción 1' }, { value: 'opcion2', label: 'Opción 2' }];
      }
      if (field.defaultValue == null) field.defaultValue = field.options[0].value;
    }
    if (newType === 'steps_slider') {
      if (!Array.isArray(field.steps) || field.steps.length === 0) {
        field.steps = [1, 10, 25, 50];
      }
      if (field.defaultValue == null) field.defaultValue = field.steps[Math.floor(field.steps.length / 2)];
    }
    if (newType === 'color_slider') {
      if (field.min == null) field.min = 0;
      if (field.max == null) field.max = 360;
      if (field.defaultValue == null) field.defaultValue = 180;
    }
    if (newType === 'white_balance') {
      if (field.min == null) field.min = -100;
      if (field.max == null) field.max = 100;
      if (field.defaultValue == null) field.defaultValue = 0;
    }
    if (newType === 'rotation_dial') {
      if (field.min == null) field.min = -180;
      if (field.max == null) field.max = 180;
      if (field.defaultValue == null) field.defaultValue = 0;
    }
    // Containers: section y scope_picker tienen children + display_style
    if (newType === 'section' || newType === 'scope_picker') {
      if (!Array.isArray(field.children)) field.children = [];
      if (!field.display_style) field.display_style = 'flat';
    }
    // Position picker: 9 puntos discretos, defaultValue centro
    if (newType === 'position_picker') {
      if (field.defaultValue == null) field.defaultValue = 'center';
    }
    // Visual grid picker: options de cards con icon
    if (newType === 'visual_grid_picker') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [
          { value: 'option_a', label: 'Opción A', icon: 'placeholder' },
          { value: 'option_b', label: 'Opción B', icon: 'placeholder' }
        ];
      }
      if (field.defaultValue == null) field.defaultValue = field.options[0].value;
    }
    // Palette picker: options con colors array
    if (newType === 'palette_picker') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [
          { value: 'palette_a', label: 'Paleta A', colors: ['#1a5e63','#2a8b8e','#f5e1c5','#e8a35d','#c46d2f'] },
          { value: 'palette_b', label: 'Paleta B', colors: ['#0a1929','#1a3a5c','#4a90e2','#a4cce8','#e0eef9'] }
        ];
      }
      if (field.defaultValue == null) field.defaultValue = field.options[0].value;
    }
    // Logo picker: options con logo key
    if (newType === 'logo_picker') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [
          { value: 'instagram', label: 'Instagram', logo: 'instagram' },
          { value: 'tiktok',    label: 'TikTok',    logo: 'tiktok' }
        ];
      }
      if (field.defaultValue == null) field.defaultValue = field.options[0].value;
    }
    // Thumbnail picker: options con thumbnail (gradient/url)
    if (newType === 'thumbnail_picker') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        field.options = [
          { value: 'opt_a', label: 'Opción A', thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { value: 'opt_b', label: 'Opción B', thumbnail: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }
        ];
      }
      if (field.defaultValue == null) field.defaultValue = field.options[0].value;
    }
  };

  // Visual_grid_picker también usa options
  // (TYPES_WITH_OPTIONS ya incluye los choice; añadimos el nuevo)

  // Containers permitidos: estos input_types pueden tener children y display_style
  const TYPES_CONTAINER = new Set(['section', 'scope_picker']);

  /** Renderiza <optgroup>s con los input_types disponibles. Si el tipo actual NO está
   *  en el catálogo (vino de DB con un input_type desconocido), añade un optgroup
   *  "Personalizado" con esa entrada para que no se pierda al cambiar otra option. */
  P.renderInputTypeOptions = function (currentType) {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const known = new Set();
    let html = '';
    this.INPUT_TYPE_GROUPS.forEach(group => {
      html += `<optgroup label="${esc(group.label)}">`;
      group.items.forEach(([val, label]) => {
        known.add(val);
        const sel = (currentType === val) ? ' selected' : '';
        html += `<option value="${esc(val)}"${sel}>${esc(label)}</option>`;
      });
      html += '</optgroup>';
    });
    if (currentType && !known.has(currentType)) {
      html += `<optgroup label="Personalizado"><option value="${esc(currentType)}" selected>${esc(currentType)} (custom)</option></optgroup>`;
    }
    return html;
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
    const arr = this.getCanvasFields();
    const original = arr[index];
    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      key: this.generateFieldKey(original.key),
      label: `${original.label} (copia)`
    };

    arr.splice(index + 1, 0, duplicate);
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.selectField(index + 1);
    this.updateJsonPreview();
  };

  P.deleteField = function (index) {
    this.getCanvasFields().splice(index, 1);
    this.hasUnsavedChanges = true;

    // Reajustar selección: el chequeo explícito evita comparaciones con null que producen falsos negativos
    if (this.selectedFieldIndex == null) {
      // nada que hacer
    } else if (this.selectedFieldIndex === index) {
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

    // -------- TAB: GENERAL (contenido visible) --------
    let generalPanel = '';
    if (t === 'section') {
      generalPanel = `
        <div class="property-group">
          <h4>Sección</h4>
          <div class="property-field">
            <label for="propStructuralTitle">Título</label>
            <input type="text" id="propStructuralTitle" value="${esc(field.title || field.label)}" placeholder="Ej: Información general">
          </div>
          <div class="property-field">
            <label for="propStructuralDesc">Descripción (subtítulo)</label>
            <input type="text" id="propStructuralDesc" value="${esc(field.section_description)}" placeholder="Aparece bajo el título en gris">
          </div>
          <div class="property-toggle">
            <label><input type="checkbox" id="propStructuralCollapsible" ${field.collapsible ? 'checked' : ''}><span>Colapsable</span></label>
          </div>
        </div>`;
    } else if (t === 'divider') {
      generalPanel = `
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
      generalPanel = `
        <div class="property-group">
          <h4>Título</h4>
          <div class="property-field">
            <label for="propStructuralText">Texto</label>
            <input type="text" id="propStructuralText" value="${esc(field.text || field.label)}" placeholder="Ej: Configuración avanzada">
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
      const md = field.markdown != null ? field.markdown : (field.text || field.label || '');
      generalPanel = `
        <div class="property-group">
          <h4>Texto informativo</h4>
          <div class="property-field">
            <label for="propStructuralMarkdown">Contenido (Markdown)</label>
            <textarea id="propStructuralMarkdown" rows="8" class="property-md-editor property-input--mono" placeholder="# Título&#10;&#10;Párrafo con **negritas**, *italic* y [enlaces](https://...).&#10;&#10;- Item 1&#10;- Item 2">${esc(md)}</textarea>
            <span class="field-help">Soporta # h1/h2/h3, **bold**, *italic*, [link](url), - listas y párrafos separados por línea en blanco.</span>
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

    // -------- TAB: ESTILOS (alignment / spacing visual) --------
    let stylesPanel = '';
    if (t === 'heading' || t === 'description' || t === 'description_block') {
      stylesPanel = `
        <div class="property-group">
          <div class="property-group-head">
            <h4><i class="aisc-ico aisc-ico--menu"></i> Alineación</h4>
          </div>
          <div class="property-field">
            <label>Alineación del texto</label>
            <div class="property-segmented" data-segmented="propStructuralAlignment">
              <button type="button" data-value="left"   ${(field.alignment || 'left') === 'left'   ? 'class="active"' : ''}>Izquierda</button>
              <button type="button" data-value="center" ${field.alignment === 'center' ? 'class="active"' : ''}>Centro</button>
              <button type="button" data-value="right"  ${field.alignment === 'right'  ? 'class="active"' : ''}>Derecha</button>
            </div>
            <input type="hidden" id="propStructuralAlignment" value="${esc(field.alignment || 'left')}">
          </div>
        </div>`;
    } else if (t === 'divider') {
      stylesPanel = `
        <div class="property-group">
          <div class="property-group-head">
            <h4><i class="aisc-ico aisc-ico--filter"></i> Espaciado</h4>
          </div>
          <div class="property-field">
            <label>Espaciado vertical</label>
            <div class="property-segmented" data-segmented="propStructuralSpacing">
              <button type="button" data-value="small"  ${(field.spacing || 'medium') === 'small'  ? 'class="active"' : ''}>Pequeño</button>
              <button type="button" data-value="medium" ${(field.spacing || 'medium') === 'medium' ? 'class="active"' : ''}>Medio</button>
              <button type="button" data-value="large"  ${field.spacing === 'large' ? 'class="active"' : ''}>Grande</button>
            </div>
            <input type="hidden" id="propStructuralSpacing" value="${esc(field.spacing || 'medium')}">
          </div>
        </div>`;
    } else {
      stylesPanel = '<div class="properties-empty"><p>Este bloque no tiene opciones de estilo.</p></div>';
    }

    // -------- TAB: CONFIGURACIÓN (key + tipo read-only) --------
    const configPanel = `
      <div class="property-group property-group--mono">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--cursor-click"></i> Identificador</h4>
        </div>
        <div class="property-field">
          <label for="propKey">Variable key (referencia)</label>
          <div class="property-key-wrap">
            <span class="property-key-prefix">block.</span>
            <input type="text" id="propKey" value="${esc(field.key)}" pattern="[a-z_][a-z0-9_]*" title="Letras, números o _. Debe iniciar con letra o _." class="property-input--mono">
          </div>
          <span class="field-help">Opcional. No se envía al backend; útil para referenciar el bloque desde lógica condicional.</span>
        </div>
      </div>
      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--credit-card"></i> Tipo</h4>
        </div>
        <div class="property-field">
          <label>Tipo estructural</label>
          <div class="property-mono-line">${esc(t)}</div>
          <span class="field-help">Los bloques estructurales no aceptan cambio de tipo. Usa la librería para insertar otro.</span>
        </div>
      </div>
    `;

    panel.innerHTML =
      this.renderPropertiesHeader(field, this.selectedFieldIndex) +
      this.renderPropertiesTabs([
        { id: 'general',  label: 'General',       icon: 'sliders',     content: generalPanel || '<div class="properties-empty"><p>Sin propiedades para este tipo.</p></div>' },
        { id: 'styles',   label: 'Estilos',       icon: 'paint-brush', content: stylesPanel  },
        { id: 'config',   label: 'Configuración', icon: 'code',        content: configPanel  }
      ]);

    this.setupPropertiesHeaderListeners();
    this.setupPropertiesTabsListeners();
    this.setupPropertiesSegmentedListeners();
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
      const mdEl = this.querySelector('#propStructuralMarkdown');
      const alignEl = this.querySelector('#propStructuralAlignment');
      if (mdEl) mdEl.addEventListener('input', () => { field.markdown = mdEl.value; field.text = mdEl.value; sync(); });
      if (alignEl) alignEl.addEventListener('change', () => { field.alignment = alignEl.value; sync(); });
    }
  };

  P.renderPropertiesPanel = function () {
    const panel = this.querySelector('#propertiesPanel');
    if (!panel) return;

    if (this.selectedFieldIndex === null || !this.getCanvasFields()[this.selectedFieldIndex]) {
      panel.innerHTML = `
        <div class="properties-empty">
          <i class="aisc-ico aisc-ico--cursor-click"></i>
          <p>Selecciona un campo para editar sus propiedades</p>
        </div>
      `;
      return;
    }
    
    const field = this.getCanvasFields()[this.selectedFieldIndex];
    if (this.isStructuralField(field)) {
      this.renderStructuralPropertiesPanel(field, panel);
      return;
    }
    const isColores = (field.input_type || field.type) === 'colores';
    const dataType = isColores ? 'array' : (field.data_type || this.inferDataType(field));
    const defaultValueBlock = this.renderDefaultValueBlock(field, dataType);
    const fieldType = (field.input_type || field.type || 'text');
    const isContainer = ['section','scope_picker'].indexOf(fieldType) >= 0;
    const isRange = fieldType === 'range';
    const isScopePicker = fieldType === 'scope_picker';
    const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));

    // -------- TAB: GENERAL (etiquetas + comportamiento básico) --------
    const generalPanel = `
      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--textbox"></i> Etiquetas</h4>
        </div>
        <div class="property-field">
          <label for="propLabel">Título del input</label>
          <input type="text" id="propLabel" value="${esc(field.label)}" placeholder="Ej: Nombre del producto">
          <span class="field-help">El texto que ve el usuario encima del control.</span>
        </div>
        <div class="property-field">
          <label for="propPlaceholder">Placeholder</label>
          <input type="text" id="propPlaceholder" value="${esc(field.placeholder)}" placeholder="Ej: Empieza a escribir...">
        </div>
        <div class="property-field">
          <label for="propDescription">Texto de ayuda</label>
          <input type="text" id="propDescription" value="${esc(field.description)}" placeholder="Aparece debajo del control en gris">
        </div>
      </div>

      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--check"></i> Comportamiento</h4>
        </div>
        <div class="property-toggle">
          <label>
            <input type="checkbox" id="propRequired" ${field.required ? 'checked' : ''}>
            <span>Campo requerido</span>
            <small>Bloquea el envío del formulario si está vacío</small>
          </label>
        </div>
      </div>
    `;

    // -------- TAB: ESTILOS (apariencia visual) --------
    const stylesPanel = `
      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--grid"></i> Layout</h4>
        </div>
        <div class="property-field">
          <label>Ancho del control</label>
          <div class="property-segmented" data-segmented="propWidth">
            <button type="button" data-value="full"  ${(field.ui?.width || 'full') === 'full'  ? 'class="active"' : ''}>100%</button>
            <button type="button" data-value="half"  ${field.ui?.width === 'half'  ? 'class="active"' : ''}>50%</button>
            <button type="button" data-value="third" ${field.ui?.width === 'third' ? 'class="active"' : ''}>33%</button>
          </div>
          <input type="hidden" id="propWidth" value="${(field.ui?.width || 'full')}">
        </div>
        <div class="property-toggle">
          <label>
            <input type="checkbox" id="propHidden" ${field.ui?.hidden ? 'checked' : ''}>
            <span>Oculto por defecto</span>
            <small>El usuario no lo verá hasta que otra condición lo active</small>
          </label>
        </div>
      </div>

      ${isContainer ? `
      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--layers"></i> Variante del contenedor</h4>
        </div>
        <div class="property-field">
          <label>Cómo se agrupan los inputs anidados</label>
          <div class="property-style-grid">
            ${[
              { v: 'flat',      lbl: 'Flat',      desc: 'Lista plana' },
              { v: 'bordered',  lbl: 'Bordered',  desc: 'Card con borde' },
              { v: 'accordion', lbl: 'Accordion', desc: 'Colapsable' },
              { v: 'tabs',      lbl: 'Tabs',      desc: 'Cada sub-container = tab' }
            ].map(o => `
              <button type="button" class="property-style-card ${(field.display_style || 'flat') === o.v ? 'active' : ''}" data-style-value="${o.v}" data-style-target="propDisplayStyle">
                <div class="property-style-card-preview prop-style-${o.v}"></div>
                <div class="property-style-card-lbl">${o.lbl}</div>
                <div class="property-style-card-desc">${o.desc}</div>
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="propDisplayStyle" value="${esc(field.display_style || 'flat')}">
        </div>
      </div>
      ` : ''}

      ${isRange ? `
      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--filter"></i> Variante del slider</h4>
        </div>
        <div class="property-field">
          <label>Estilo visual del slider</label>
          <div class="property-style-grid">
            ${[
              { v: 'simple',     lbl: 'Simple',  desc: 'Valor a la derecha' },
              { v: 'tooltip',    lbl: 'Tooltip', desc: 'Flota sobre el thumb' },
              { v: 'range_dual', lbl: 'Dual',    desc: 'Min/max con 2 thumbs' }
            ].map(o => {
              const isActive = (field.display_style === o.v) || (o.v === 'simple' && !field.display_style) || (o.v === 'range_dual' && (field.display_style === 'dual' || field.display_style === 'range'));
              return `
              <button type="button" class="property-style-card ${isActive ? 'active' : ''}" data-style-value="${o.v}" data-style-target="propRangeDisplayStyle">
                <div class="property-style-card-preview prop-range-${o.v}"></div>
                <div class="property-style-card-lbl">${o.lbl}</div>
                <div class="property-style-card-desc">${o.desc}</div>
              </button>
            `;}).join('')}
          </div>
          <input type="hidden" id="propRangeDisplayStyle" value="${esc(field.display_style || 'simple')}">
        </div>
      </div>
      ` : ''}
    `;

    // -------- TAB: CONFIGURACIÓN (técnico / dev) --------
    const configPanel = `
      <div class="property-group property-group--mono">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--cursor-click"></i> Identificador</h4>
        </div>
        <div class="property-field">
          <label for="propKey">Variable key</label>
          <div class="property-key-wrap">
            <span class="property-key-prefix">field.</span>
            <input type="text" id="propKey" value="${esc(field.key)}" pattern="[a-z_][a-z0-9_]*" title="Letras, números o _. Debe iniciar con letra o _." class="property-input--mono">
          </div>
          <span class="field-help">Identificador único enviado al backend en el JSON del formulario.</span>
        </div>
      </div>

      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--credit-card"></i> Tipo de control</h4>
        </div>
        <div class="property-field">
          <label for="propInputType">Input type</label>
          <select id="propInputType">
            ${this.renderInputTypeOptions(fieldType || 'text')}
          </select>
          <span class="field-help">Cambiarlo limpia propiedades incompatibles.</span>
        </div>

        ${isRange ? `
        <div class="property-field">
          <label for="propRangeSuffix">Sufijo del valor</label>
          <input type="text" id="propRangeSuffix" value="${esc(field.suffix)}" placeholder="%, °, px, ..." class="property-input--mono">
          <span class="field-help">Concatenado al valor (ej. <code>42%</code>).</span>
        </div>
        ` : ''}
      </div>

      ${isScopePicker ? `
      <div class="property-group property-group--vera">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--sparkle"></i> Modo Vera</h4>
          <span class="property-group-badge">LLM</span>
        </div>
        <div class="property-field">
          <label for="propVeraPrompt">Prompt del modelo</label>
          <textarea id="propVeraPrompt" rows="6" placeholder="Ej: Adáptate al producto y a la marca para crear un personaje protagonista coherente. Decide cabello, ojos y etnia que mejor encajen con el target." class="property-input--mono">${esc(field.vera_prompt)}</textarea>
          <span class="field-help">Cuando el usuario active el switch <strong>Vera</strong>, este prompt + las <code>keys</code> de los inputs anidados se envían al LLM para autocompletar las variables.</span>
        </div>
      </div>
      ` : ''}

      ${this.renderTypeSpecificProperties(field)}

      <div class="property-group">
        <div class="property-group-head">
          <h4><i class="aisc-ico aisc-ico--cloud"></i> Datos</h4>
        </div>
        <div class="property-field">
          <label for="propDataType">data_type</label>
          <select id="propDataType" ${isColores ? 'disabled' : ''}>
            <option value="string" ${dataType === 'string' ? 'selected' : ''}>String</option>
            <option value="number" ${dataType === 'number' ? 'selected' : ''}>Number</option>
            <option value="boolean" ${dataType === 'boolean' ? 'selected' : ''}>Boolean</option>
            <option value="array" ${dataType === 'array' ? 'selected' : ''}>Array</option>
            <option value="object" ${dataType === 'object' ? 'selected' : ''}>Object (JSON)</option>
          </select>
          ${isColores ? '<span class="field-help">Colores siempre es array (lista de hex).</span>' : '<span class="field-help">Cómo se serializa el valor enviado al backend.</span>'}
        </div>
        ${defaultValueBlock}
      </div>
    `;

    panel.innerHTML =
      this.renderPropertiesHeader(field, this.selectedFieldIndex) +
      this.renderPropertiesTabs([
        { id: 'general',  label: 'General',       icon: 'sliders',          content: generalPanel },
        { id: 'styles',   label: 'Estilos',       icon: 'paint-brush',      content: stylesPanel  },
        { id: 'config',   label: 'Configuración', icon: 'code',             content: configPanel  }
      ]);

    this.setupPropertiesHeaderListeners();
    this.setupPropertiesTabsListeners();
    this.setupPropertiesStyleCardListeners();
    this.setupPropertiesSegmentedListeners();
    this.setupPropertiesListeners();
    this.syncDefaultValueAndExtraConfigToDom(field, dataType);
    if (window.InputRegistry && window.InputRegistry.initColorsPicker) window.InputRegistry.initColorsPicker(panel);
    if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) window.InputRegistry.initAspectRatioPicker(panel);
  };

  /** Header del panel: icono del tipo + label + path/key + quick actions */
  P.renderPropertiesHeader = function (field, index) {
    const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
    const type = (field.input_type || field.type || 'text').toLowerCase();
    const icon = this.getInputTypeIcon(type);
    const total = this.getCanvasFields().length;
    const canMoveUp = index > 0;
    const canMoveDown = index < total - 1;
    return `
      <div class="properties-header">
        <div class="properties-header-main">
          <div class="properties-header-icon"><i class="ph ph-${icon}"></i></div>
          <div class="properties-header-text">
            <div class="properties-header-title">${esc(field.label || field.key || 'Sin título')}</div>
            <div class="properties-header-path">
              <span class="ph-prop-type">${esc(type)}</span>
              <span class="ph-prop-sep">·</span>
              <code>${esc(field.key || 'sin_key')}</code>
            </div>
          </div>
        </div>
        <div class="properties-header-actions">
          <button type="button" class="prop-action-btn" data-prop-action="move-up" title="Mover arriba" aria-label="Mover arriba" ${canMoveUp ? '' : 'disabled'}><i class="aisc-ico aisc-ico--chevron-up"></i></button>
          <button type="button" class="prop-action-btn" data-prop-action="move-down" title="Mover abajo" aria-label="Mover abajo" ${canMoveDown ? '' : 'disabled'}><i class="aisc-ico aisc-ico--chevron-down"></i></button>
          <button type="button" class="prop-action-btn" data-prop-action="duplicate" title="Duplicar" aria-label="Duplicar"><i class="aisc-ico aisc-ico--copy"></i></button>
          <button type="button" class="prop-action-btn prop-action-btn--danger" data-prop-action="delete" title="Eliminar" aria-label="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
        </div>
      </div>
    `;
  };


  /** Mapa input_type → icono Phosphor para el header */
  P.getInputTypeIcon = function (type) {
    const map = {
      // text family
      text: 'text-aa', textarea: 'text-aa', string: 'text-aa', prompt_input: 'sparkle', prompt_system: 'sparkle',
      tag_input: 'tag', tags: 'tag', slug_input: 'link-simple', code_input: 'code', markdown: 'markdown-logo',
      labels: 'tag', instructions: 'note', notes: 'note',
      // selectors
      brand_selector: 'storefront', entity_selector: 'cube', audience_selector: 'users', campaign_selector: 'megaphone', product_selector: 'package',
      // select
      select: 'caret-down', dropdown: 'caret-down', multi_select: 'list-checks',
      choice_chips: 'list-bullets', multi_select_chips: 'list-checks', checkboxes: 'check-square',
      flags: 'flag', tone_selector: 'wave-sine', mood_selector: 'smiley', length_selector: 'ruler',
      colores: 'palette', aspect_ratio: 'frame-corners',
      // pickers
      scope_picker: 'target', image_selector: 'image', gallery_picker: 'images',
      visual_reference: 'image-square', position_picker: 'crosshair', visual_grid_picker: 'squares-four',
      palette_picker: 'palette', logo_picker: 'image-square', thumbnail_picker: 'image-square',
      // boolean
      radio: 'radio-button', radio_buttons: 'radio-button', checkbox: 'check-square', switch: 'toggle-left',
      toggle_switch: 'toggle-left', boolean: 'toggle-left', toggle: 'toggle-left', selection_checkboxes: 'check-square',
      // number
      number: 'number-square-one', stepper: 'plus-minus', stepper_num: 'plus-minus', num_stepper: 'plus-minus',
      rating: 'star',
      // range
      range: 'sliders-horizontal', slider: 'sliders-horizontal',
      segmented_control: 'rows', steps_slider: 'list-numbers', color_slider: 'palette',
      gradient: 'paint-bucket',
      white_balance: 'sun', rotation_dial: 'arrows-clockwise',
      // file
      file: 'paperclip', upload: 'upload-simple',
      cron_schedule: 'clock',
      // structural
      section: 'square', divider: 'minus', heading: 'text-h', description: 'text-align-left',
      description_block: 'text-align-left',
      accordion: 'caret-down', tabs: 'tabs',
      // misc
      camera_angle: 'video-camera', shot_type: 'video-camera', lens_focal_length: 'eye',
      depth_of_field: 'eye', composition_structure: 'frame-corners', lighting_style: 'sun',
      color_grade_preset: 'palette', contrast_level: 'sliders-horizontal', saturation_level: 'sliders-horizontal',
      grain_amount: 'sliders-horizontal', glow_amount: 'sliders-horizontal', finish_type: 'sparkle',
      floating_product: 'cube', camera_movement: 'arrows-out', camera_path: 'path',
      camera_roll: 'arrows-clockwise', focus_pull: 'eye', shot_speed: 'gauge',
      frame_rate_style: 'film-strip', motion_style_video: 'film-strip', zoom_behavior: 'magnifying-glass',
      loop_behavior: 'arrows-clockwise', parallax_layers: 'stack', perspective_grid: 'frame-corners',
      transition_anchor: 'lock', vanishing_point_bias: 'crosshair',
      background_type: 'image-square', environment_theme: 'mountains', props_density: 'sliders-horizontal',
      emotion_profile: 'smiley', ethnicity_profile: 'user', eye_color: 'eye',
      hair_color: 'palette', hair_style: 'user', pose_direction: 'arrow-bend-up-right',
      wardrobe_style: 'tshirt'
    };
    const raw = map[type] || 'squares-four';
    // Ruteamos por getPhosphorIconName para que cualquier icono fuera del subset
    // caiga a un fallback válido en vez de quedar invisible.
    return this.getPhosphorIconName ? this.getPhosphorIconName(raw) : raw;
  };

  /** Mover field por delta (+1 / -1) dentro del array top-level */
  P.moveFieldByDelta = function (index, delta) {
    const arr = this.getCanvasFields();
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
    this.selectedFieldIndex = target;
    this.hasUnsavedChanges = true;
    this.renderCanvas();
    this.renderPropertiesPanel();
    this.updateJsonPreview();
  };

  /** Listeners del header (mover, duplicar, eliminar) */
  P.setupPropertiesHeaderListeners = function () {
    const header = this.querySelector('.properties-header');
    if (!header) return;
    header.querySelectorAll('[data-prop-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.getAttribute('data-prop-action');
        const idx = this.selectedFieldIndex;
        if (idx == null) return;
        if (action === 'move-up') this.moveFieldByDelta(idx, -1);
        else if (action === 'move-down') this.moveFieldByDelta(idx, +1);
        else if (action === 'duplicate') this.duplicateField(idx);
        else if (action === 'delete') {
          if (confirm('¿Eliminar este campo? Esta acción no se puede deshacer hasta guardar.')) {
            this.deleteField(idx);
          }
        }
      });
    });
  };


  /** Listeners para .property-style-card (grid de variantes display_style) */
  P.setupPropertiesStyleCardListeners = function () {
    this.querySelectorAll('.property-style-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = card.getAttribute('data-style-target');
        const value = card.getAttribute('data-style-value');
        const hidden = this.querySelector('#' + targetId);
        if (!hidden) return;
        // marcar activo solo en el mismo grupo (mismo data-style-target)
        this.querySelectorAll('.property-style-card[data-style-target="' + targetId + '"]').forEach(c => c.classList.toggle('active', c === card));
        hidden.value = value;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  };

  /** Listeners para .property-segmented (botones de width) */
  P.setupPropertiesSegmentedListeners = function () {
    this.querySelectorAll('[data-segmented]').forEach(grp => {
      const targetId = grp.getAttribute('data-segmented');
      const hidden = this.querySelector('#' + targetId);
      grp.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          grp.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
          if (hidden) {
            hidden.value = btn.getAttribute('data-value');
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    });
  };

  /** Renderiza el header de tabs + body con los paneles. Mantiene el último
   *  tab activo entre re-renders (this._propActiveTab). */
  P.renderPropertiesTabs = function (tabs) {
    const activeId = this._propActiveTab && tabs.some(t => t.id === this._propActiveTab)
      ? this._propActiveTab
      : tabs[0].id;
    const safeIcon = (name) => this.getPhosphorIconName ? this.getPhosphorIconName(name) : name;
    const headerHtml = tabs.map(t =>
      `<button type="button" class="properties-tab-btn${t.id === activeId ? ' active' : ''}" data-prop-tab="${t.id}">` +
        (t.icon ? `<i class="ph ph-${safeIcon(t.icon)}"></i>` : '') +
        `<span>${t.label}</span>` +
      `</button>`
    ).join('');
    const bodyHtml = tabs.map(t =>
      `<div class="properties-tab-panel${t.id === activeId ? ' active' : ''}" data-prop-tab-panel="${t.id}">` +
        `<div class="properties-form">${t.content}</div>` +
      `</div>`
    ).join('');
    return `
      <div class="properties-tabs" data-tabs-root="1">
        <div class="properties-tabs-header" role="tablist">${headerHtml}</div>
        <div class="properties-tabs-body">${bodyHtml}</div>
      </div>
    `;
  };

  P.setupPropertiesTabsListeners = function () {
    const root = this.querySelector('[data-tabs-root="1"]');
    if (!root) return;
    const buttons = root.querySelectorAll('.properties-tab-btn');
    const panels = root.querySelectorAll('.properties-tab-panel');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-prop-tab');
        this._propActiveTab = id;
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        panels.forEach(p => p.classList.toggle('active', p.getAttribute('data-prop-tab-panel') === id));
      });
    });
  };

  P.inferDataType = function (field) {
    const t = (field.input_type || field.type || '').toLowerCase();
    if (['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(t) >= 0) return 'number';
    if (['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(t) >= 0) return 'boolean';
    if (['select', 'multi_select', 'tone_selector', 'mood_selector', 'length_selector', 'radio', 'aspect_ratio', 'checkboxes'].indexOf(t) >= 0) return 'string';
    if (['tag_input', 'gallery_picker', 'selection_checkboxes', 'colores'].indexOf(t) >= 0) return 'array';
    if (['brand_selector', 'entity_selector', 'audience_selector', 'campaign_selector', 'product_selector', 'image_selector', 'scope_picker'].indexOf(t) >= 0) return 'object';
    return field.data_type || 'string';
  };

  P.renderDefaultValueBlock = function (field, dataType) {
    const type = (field.input_type || field.type || '').toLowerCase();
    const isNumberFamily = ['number', 'range', 'stepper', 'stepper_num', 'num_stepper', 'rating', 'slider'].indexOf(type) >= 0;
    const isBooleanFamily = ['checkbox', 'switch', 'boolean', 'toggle', 'toggle_switch'].indexOf(type) >= 0;
    const hasOptions = ['dropdown', 'select', 'radio', 'checkboxes', 'tone_selector', 'mood_selector', 'length_selector', 'aspect_ratio', 'selection_checkboxes'].indexOf(type) >= 0;
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
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              ` : (field.options || []).map((opt, i) => {
                const v = opt && (opt.value !== undefined ? opt.value : opt.label !== undefined ? opt.label : opt);
                const str = (v != null ? String(v) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="etiqueta" data-index="${i}" value="${escapeProp(str)}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtnSlider">
              <i class="aisc-ico aisc-ico--add"></i> Opciones
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
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>`;
              }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtnColores">
              <i class="aisc-ico aisc-ico--add"></i> Añadir color
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

      case 'scope_picker': {
        const options = field.options || [];
        const optVal = (o) => (o && (o.value !== undefined ? o.value : o.label !== undefined ? o.label : o));
        return `
          <div class="property-group">
            <h4>Opciones de enfoque (scope picker)</h4>
            <span class="field-help">Opciones que verá el usuario al desactivar «Que la IA decida». Valor y etiqueta por opción.</span>
            <div class="property-field">
              <label>Opciones</label>
            </div>
            <div class="options-editor options-editor--dropdown" id="optionsEditor">
              ${options.length === 0 ? `
                <div class="option-row" data-index="0">
                  <input type="text" class="option-single" placeholder="ej. Identidad de marca" data-index="0">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              ` : options.map((opt, i) => {
                const str = escapeProp(optVal(opt) != null ? String(optVal(opt)) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="ej. Identidad de marca" data-index="${i}" value="${str}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtn">
              <i class="aisc-ico aisc-ico--add"></i> Opciones
            </button>
          </div>
        `;
      }

      case 'select':
      case 'radio':
      case 'checkboxes':
      case 'selection_checkboxes': {
        const options = field.options || [];
        const it = (field.input_type || field.type || '').toLowerCase();
        const isSelect = it === 'select' || it === 'dropdown' || it === 'multi_select';
        const isDropdown = it === 'dropdown' || it === 'select';
        const isRadio = it === 'radio';
        const isCheckboxes = it === 'checkboxes';
        const isSelectionCheckboxes = it === 'selection_checkboxes';
        const isFlags = it === 'flags';
        const isColores = it === 'colores';
        const isAspectRatio = it === 'aspect_ratio';
        const title = isAspectRatio ? 'Aspect ratio' : (isColores ? 'Colores' : (isFlags ? 'Flags' : (isCheckboxes ? 'Checkboxes (una opción → variable = valor)' : (isSelectionCheckboxes ? 'Checkboxes múltiples (array)' : (isRadio ? 'Radio Buttons' : (isDropdown ? 'Dropdown' : 'Lista desplegable'))))));
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
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              ` : options.map((opt, i) => {
                const str = escapeProp(optVal(opt) != null ? String(optVal(opt)) : '');
                return `
                <div class="option-row" data-index="${i}">
                  <input type="text" class="option-single" placeholder="ej. rubia" data-index="${i}" value="${str}">
                  <button type="button" class="btn-icon remove-option" title="Eliminar"><i class="aisc-ico aisc-ico--close"></i></button>
                </div>
              `; }).join('')}
            </div>
            <button type="button" class="btn-small btn-add-options" id="addOptionBtn">
              <i class="aisc-ico aisc-ico--add"></i> Opciones
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
                <label class="property-toggle">
                  <input type="checkbox" data-type="character" ${entityTypes.includes('character') ? 'checked' : ''}>
                  <span>Personajes</span>
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
              ${selectionMode === 'multiple' ? `
              <div class="property-field">
                <label for="propImageMaxSel">Máximo seleccionable</label>
                <input type="number" id="propImageMaxSel" min="1" max="20" value="${field.max_selections != null ? field.max_selections : ''}" placeholder="sin límite">
              </div>
              <div class="property-field">
                <label for="propImageMinSel">Mínimo seleccionable</label>
                <input type="number" id="propImageMinSel" min="0" max="20" value="${field.min_selections != null ? field.min_selections : ''}" placeholder="0">
                <span class="field-help">Si el flujo exige una cantidad fija (ej. 3 productos obligatorios), pon el mismo número en mínimo y máximo.</span>
              </div>
              ` : ''}
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
    const field = this.getCanvasFields()[this.selectedFieldIndex];
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
      const validateKey = (raw) => {
        const cleaned = (raw || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!cleaned) return { ok: false, reason: 'vacío' };
        if (!/^[a-z_]/.test(cleaned)) return { ok: false, reason: 'debe iniciar con letra o guion bajo' };
        if (this.getCanvasFields().some((f, i) => i !== this.selectedFieldIndex && f.key === cleaned)) {
          return { ok: false, reason: 'duplicado con otro campo' };
        }
        return { ok: true, value: cleaned };
      };
      const apply = (e, commit) => {
        const v = validateKey(e.target.value);
        if (v.ok) {
          field.key = v.value;
          if (commit) e.target.value = v.value;
          e.target.removeAttribute('aria-invalid');
          e.target.removeAttribute('title');
          this.onFieldChange();
        } else {
          e.target.setAttribute('aria-invalid', 'true');
          e.target.title = 'Key inválida: ' + v.reason;
        }
      };
      keyInput.addEventListener('input', (e) => apply(e, false));
      keyInput.addEventListener('blur', (e) => {
        const v = validateKey(e.target.value);
        if (!v.ok) {
          e.target.value = field.key;
          e.target.removeAttribute('aria-invalid');
          e.target.removeAttribute('title');
        } else {
          apply(e, true);
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
        this.applyInputTypeChange(field, e.target.value);
        this.renderPropertiesPanel();
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    // Container display_style (solo aplica si el field es section/scope_picker)
    const displayStyleSelect = this.querySelector('#propDisplayStyle');
    if (displayStyleSelect) {
      displayStyleSelect.addEventListener('change', (e) => {
        field.display_style = e.target.value;
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    // Vera prompt (solo scope_picker): textarea con el prompt predefinido
    const veraPromptEl = this.querySelector('#propVeraPrompt');
    if (veraPromptEl) {
      veraPromptEl.addEventListener('input', (e) => {
        field.vera_prompt = e.target.value;
        this.renderCanvas();
        this.onFieldChange();
      });
    }

    // Range display_style + suffix (solo range)
    const rangeStyleEl = this.querySelector('#propRangeDisplayStyle');
    if (rangeStyleEl) {
      rangeStyleEl.addEventListener('change', (e) => {
        field.display_style = e.target.value;
        // Si cambia a range_dual, defaultValue debe ser array [min, max]
        if (e.target.value === 'range_dual' && !Array.isArray(field.defaultValue) && (!field.defaultValue || typeof field.defaultValue !== 'object')) {
          const lo = Math.floor(((field.min ?? 0) + (field.max ?? 100)) * 0.25);
          const hi = Math.floor(((field.min ?? 0) + (field.max ?? 100)) * 0.75);
          field.defaultValue = [lo, hi];
        } else if (e.target.value !== 'range_dual' && Array.isArray(field.defaultValue)) {
          field.defaultValue = field.defaultValue[0] ?? 50;
        }
        this.renderCanvas();
        this.renderPropertiesPanel();
        this.onFieldChange();
      });
    }
    const rangeSuffixEl = this.querySelector('#propRangeSuffix');
    if (rangeSuffixEl) {
      rangeSuffixEl.addEventListener('input', (e) => {
        field.suffix = e.target.value;
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
      const markInvalid = (el, reason) => {
        el.setAttribute('aria-invalid', 'true');
        el.classList.add('property-json-editor--invalid');
        el.title = 'JSON inválido: ' + reason;
      };
      const clearInvalid = (el) => {
        el.removeAttribute('aria-invalid');
        el.classList.remove('property-json-editor--invalid');
        el.removeAttribute('title');
      };
      // Marcar al vuelo mientras escribe; commit en blur
      defaultValueJson.addEventListener('input', (e) => {
        const raw = (e.target.value || '').trim();
        if (!raw) { clearInvalid(e.target); return; }
        try {
          const parsed = JSON.parse(raw);
          if (field.data_type === 'array' && !Array.isArray(parsed)) {
            markInvalid(e.target, 'se esperaba array');
            return;
          }
          if (field.data_type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
            markInvalid(e.target, 'se esperaba objeto');
            return;
          }
          clearInvalid(e.target);
        } catch (_) {
          markInvalid(e.target, 'sintaxis');
        }
      });
      defaultValueJson.addEventListener('blur', (e) => {
        const raw = (e.target.value || '').trim();
        if (!raw) {
          field.defaultValue = (field.data_type === 'array') ? [] : {};
          clearInvalid(e.target);
          this.onFieldChange();
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (field.data_type === 'array' && !Array.isArray(parsed)) {
            markInvalid(e.target, 'se esperaba array');
            this.showNotification('Valor por defecto: se esperaba un array', 'error');
            return; // mantiene el raw del usuario, no resetea
          }
          if (field.data_type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
            markInvalid(e.target, 'se esperaba objeto');
            this.showNotification('Valor por defecto: se esperaba un objeto', 'error');
            return; // mantiene el raw del usuario, no resetea
          }
          field.defaultValue = parsed;
          e.target.value = JSON.stringify(parsed, null, 2);
          clearInvalid(e.target);
          this.onFieldChange();
        } catch (err) {
          markInvalid(e.target, 'sintaxis');
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
        // En 'single' no aplican limites de cantidad: limpiarlos.
        if (e.target.value !== 'multiple') { delete field.max_selections; delete field.min_selections; }
        this.renderCanvas();
        this.onFieldChange();
        this.renderPropertiesPanel(); // re-render: muestra/oculta Maximo/Minimo seleccionable
      });
    }

    // Maximo / Minimo seleccionable (solo image_selector multiple)
    const imageMaxSel = this.querySelector('#propImageMaxSel');
    if (imageMaxSel) {
      imageMaxSel.addEventListener('input', (e) => {
        const n = parseInt(e.target.value, 10);
        if (e.target.value === '' || isNaN(n)) { delete field.max_selections; }
        else { field.max_selections = Math.max(1, n); if (field.min_selections > field.max_selections) field.min_selections = field.max_selections; }
        this.renderCanvas();
        this.onFieldChange();
      });
    }
    const imageMinSel = this.querySelector('#propImageMinSel');
    if (imageMinSel) {
      imageMinSel.addEventListener('input', (e) => {
        const n = parseInt(e.target.value, 10);
        if (e.target.value === '' || isNaN(n)) { delete field.min_selections; }
        else { field.min_selections = Math.max(0, n); if (field.max_selections != null && field.min_selections > field.max_selections) field.min_selections = field.max_selections; }
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
    // Fase 2A: productividad (snapshot debounced + recompute issues + schedule autosave)
    if (typeof this.onStateMutated === 'function') this.onStateMutated();
  };

  P.updateJsonPreview = function () {
    const preview = this.querySelector('#jsonSchemaPreview code');
    if (!preview) return;
    const fields = this.getCanvasFields();
    const schema = { fields };
    preview.textContent = JSON.stringify(schema, null, 2);
  };

  P.generateFormPreview = function () {
    const fields = this.getCanvasFields();
    if (fields.length === 0) {
      return `
        <div class="preview-empty">
          <i class="aisc-ico aisc-ico--alert-warning"></i>
          <p>No hay campos definidos</p>
        </div>
      `;
    }
    const columns = this.uiLayoutConfig.columns || 1;
    const showLabels = this.uiLayoutConfig.showLabels !== false;
    const showHelperText = this.uiLayoutConfig.showHelperText !== false;
    const Registry = window.InputRegistry;
    const fieldsHtml = fields.map(field => {
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
            <i class="aisc-ico aisc-ico--sparkle"></i>
            ${submitText}
          </button>
        </div>
      </div>
    `;
  };

})();
