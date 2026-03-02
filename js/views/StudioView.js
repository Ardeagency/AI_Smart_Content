/**
 * StudioView - Consumidor de flujos (content_flows).
 * Panel central vacío, footer con créditos y coste, sidebar con input_schema y envío a webhook_url.
 * Usa FlowWebhookService para ejecución con timeout y reintentos; deducción de créditos atómica vía RPC.
 */

const DEFAULT_STUDIO_TIMEOUT_MS = 120000;
const DEFAULT_STUDIO_MAX_RETRIES = 3;

class StudioView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.credits = { available: 0, total: 0 };
    this.flows = [];
    this.selectedFlow = null;
  }

  _notify(message, _type = 'info') {
    if (typeof alert === 'function') alert(message);
  }

  /** Ruta base de Studio (con o sin org) para construir URL con slug del flujo. */
  getStudioBasePath() {
    if (!this.organizationId) return '/studio';
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
    return prefix ? `${prefix}/studio` : '/studio';
  }

  /** Convierte el nombre del flujo en slug para la URL (ej: "Product Render Futurista" → "product-render-futurista"). */
  flowNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.organizationId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/settings';
      window.router?.navigate(url, true);
      return;
    }

    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <div class="studio-layout" id="studioContainer">
        <main class="studio-center">
          <div class="studio-canvas-empty" id="studioCanvas"></div>
          <div class="studio-automated-wrap" id="studioAutomatedWrap" style="display: none;">
            <button type="button" class="studio-back-flows studio-back-flows--automated" id="studioBackFlowsAutomated"><i class="fas fa-arrow-left"></i> Elegir otro flujo</button>
            <div class="studio-hero" id="studioHero"></div>
            <div class="studio-schedule-form-wrap" id="studioScheduleFormWrap">
              <h2 class="studio-schedule-title">Programar este flujo</h2>
              <form class="studio-schedule-form" id="studioScheduleForm"></form>
            </div>
          </div>
          <footer class="studio-footer">
            <div class="studio-footer-credits">
              <div class="studio-credits-icon"><i class="fas fa-coins"></i></div>
              <span class="studio-credits-text" id="studioCreditsText">0 créditos restantes</span>
              <span class="studio-credits-cost" id="studioCreditsCost"></span>
            </div>
            <button type="button" class="studio-btn-producir" id="studioProducirBtn" disabled>
              Producir
            </button>
          </footer>
        </main>

        <aside class="studio-sidebar-creative" id="studioSidebar">
          <div class="studio-sidebar-content">
            <div class="studio-flows-list" id="studioFlowsList"></div>
            <div class="studio-flow-form-wrap" id="studioFlowFormWrap" style="display: none;">
              <button type="button" class="studio-back-flows" id="studioBackFlows"><i class="fas fa-arrow-left"></i> Elegir otro flujo</button>
              <h3 class="studio-form-title" id="studioFormTitle"></h3>
              <form class="studio-flow-form" id="studioFlowForm"></form>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  async init() {
    window.studioView = this;
    await this.initSupabase();
    await Promise.all([this.loadCredits(), this.loadFlows()]);

    const flowSlug = (this.routeParams && this.routeParams.flowSlug) ? decodeURIComponent(this.routeParams.flowSlug) : null;
    const preselectedId = (window.appState && window.appState.get('selectedFlowId')) || localStorage.getItem('selectedFlowId');

    let flowToSelect = null;
    if (flowSlug) {
      const found = this.flows.find(f => this.flowNameToSlug(f.name) === flowSlug);
      if (found) flowToSelect = found;
    }
    if (!flowToSelect && preselectedId) {
      const byId = this.flows.find(f => f.id === preselectedId);
      if (byId) flowToSelect = byId;
      if (window.appState) window.appState.set('selectedFlowId', null, true);
      localStorage.removeItem('selectedFlowId');
    }

    if (flowToSelect) {
      this.selectedFlow = flowToSelect;
      this.updateCreditsDisplay();
      this.applyStudioMode(flowToSelect);
      if (!flowSlug && window.router) {
        const slug = this.flowNameToSlug(flowToSelect.name);
        if (slug) window.router.navigate(`${this.getStudioBasePath()}/${encodeURIComponent(slug)}`, true);
      }
    } else {
      // Sin flujo: Studio solo se accede desde flows (seleccionando un flujo). Redirigir a flows.
      const flowsPath = `${this.getStudioBasePath()}/flows`;
      if (window.router) window.router.navigate(flowsPath, true);
      return;
    }

    this.setupEventListeners();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('Studio initSupabase:', e);
    }
  }

  async loadCredits() {
    if (!this.supabase || !this.organizationId) return;
    try {
      const { data, error } = await this.supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', this.organizationId)
        .maybeSingle();
      if (!error && data) {
        this.credits.available = data.credits_available ?? 0;
        this.credits.total = data.credits_total ?? 0;
      }
      document.dispatchEvent(new CustomEvent('credits-updated'));
    } catch (e) {
      console.error('Studio loadCredits:', e);
    }
  }

  /**
   * Carga flujos (manuales y automatizados) con su primer módulo si existe (input_schema y webhooks en flow_modules).
   * Los flujos automatizados no son modulares y pueden no tener flow_modules.
   */
  async loadFlows() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          description,
          token_cost,
          output_type,
          execution_mode,
          flow_category_type,
          flow_image_url,
          schedule_schema,
          flow_modules ( step_order, input_schema, webhook_url_test, webhook_url_prod )
        `)
        .eq('is_active', true);
      if (!error && data) {
        this.flows = data.map(f => this.buildFlowFromFirstModule(f));
      } else {
        this.flows = [];
      }
    } catch (e) {
      console.error('Studio loadFlows:', e);
      this.flows = [];
    }
  }

  /**
   * Adaptador canónico: construye el objeto flujo que usa Studio a partir de content_flows + flow_modules.
   * Toma el primer módulo (por step_order) para input_schema y webhooks. URL de webhook vía FlowWebhookService.
   */
  buildFlowFromFirstModule(flow) {
    const modules = (flow.flow_modules || []).slice().sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
    const first = modules[0] || null;
    const Service = (typeof window !== 'undefined' && window.FlowWebhookService) ? window.FlowWebhookService : null;
    const webhookUrlProd = first && Service ? Service.getWebhookUrl(first, 'prod') : (first?.webhook_url_prod || first?.webhook_url_test || null);
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      token_cost: flow.token_cost,
      output_type: flow.output_type,
      execution_mode: flow.execution_mode || 'single_step',
      flow_category_type: flow.flow_category_type || 'manual',
      flow_image_url: flow.flow_image_url || null,
      schedule_schema: flow.schedule_schema && Array.isArray(flow.schedule_schema.fields) ? flow.schedule_schema : { fields: [] },
      input_schema: first?.input_schema ?? {},
      webhook_url: webhookUrlProd,
      webhook_url_test: first?.webhook_url_test,
      webhook_url_prod: first?.webhook_url_prod
    };
  }

  updateCreditsDisplay() {
    const textEl = document.getElementById('studioCreditsText');
    const costEl = document.getElementById('studioCreditsCost');
    if (textEl) {
      const n = this.credits.available;
      textEl.textContent = `${n.toLocaleString('es')} créditos restantes`;
    }
    if (costEl) {
      if (this.selectedFlow && this.selectedFlow.token_cost != null) {
        costEl.textContent = `${this.selectedFlow.token_cost} créditos esta producción`;
        costEl.style.display = '';
      } else {
        costEl.textContent = '';
        costEl.style.display = 'none';
      }
    }
  }

  renderFlowsList() {
    const listEl = document.getElementById('studioFlowsList');
    const formWrap = document.getElementById('studioFlowFormWrap');
    if (!listEl) return;

    if (this.flows.length === 0) {
      listEl.innerHTML = '<p class="studio-empty-flows">No hay flujos disponibles.</p>';
      if (formWrap) formWrap.style.display = 'none';
      return;
    }

    listEl.innerHTML = this.flows.map(f => `
      <article class="studio-card studio-card-flow" data-flow-id="${f.id}">
        <div class="studio-card-icon"><i class="fas fa-magic"></i></div>
        <p class="studio-card-text">${this.escapeHtml(f.name)}</p>
        ${f.description ? `<p class="studio-card-desc">${this.escapeHtml(f.description)}</p>` : ''}
        <span class="studio-card-tag">${(f.token_cost ?? 1)} crédito(s)</span>
      </article>
    `).join('');

    listEl.querySelectorAll('.studio-card-flow').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-flow-id');
        const flow = this.flows.find(f => f.id === id);
        if (flow) this.selectFlow(flow);
      });
    });

    if (formWrap) formWrap.style.display = 'none';
  }

  selectFlow(flow) {
    this.selectedFlow = flow;
    this.updateCreditsDisplay();
    this.applyStudioMode(flow);

    const slug = this.flowNameToSlug(flow.name);
    if (slug && window.router) {
      window.router.navigate(`${this.getStudioBasePath()}/${encodeURIComponent(slug)}`, true);
    }
  }

  /**
   * Aplica el estado de Studio según el tipo de flujo: manual (sidebar + formulario + canvas)
   * o automático (solo hero + formulario de programación, sin sidebar ni canvas).
   */
  applyStudioMode(flow) {
    const isAutomated = flow && (flow.flow_category_type === 'automated');
    const container = document.getElementById('studioContainer');
    const canvasEl = document.getElementById('studioCanvas');
    const automatedWrap = document.getElementById('studioAutomatedWrap');
    const sidebar = document.getElementById('studioSidebar');
    const listEl = document.getElementById('studioFlowsList');
    const formWrap = document.getElementById('studioFlowFormWrap');
    const btn = document.getElementById('studioProducirBtn');

    if (container) container.classList.toggle('studio-layout--automated', isAutomated);

    if (isAutomated) {
      if (canvasEl) canvasEl.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      if (automatedWrap) {
        automatedWrap.style.display = 'block';
        this.renderStudioHero(flow);
        this.renderScheduleForm(flow);
      }
      if (btn) btn.style.display = 'none';
    } else {
      if (canvasEl) canvasEl.style.display = '';
      if (sidebar) sidebar.style.display = '';
      if (automatedWrap) automatedWrap.style.display = 'none';
      if (listEl) listEl.style.display = 'none';
      if (formWrap) formWrap.style.display = 'block';
      this.renderFlowForm(flow);
      if (btn) {
        btn.style.display = '';
        btn.disabled = !flow.webhook_url;
      }
    }
  }

  /** Rellena el hero (portada) del flujo en estado automático. */
  renderStudioHero(flow) {
    const heroEl = document.getElementById('studioHero');
    if (!heroEl) return;
    const url = flow.flow_image_url;
    const name = flow.name || 'Flujo';
    if (url) {
      const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('video');
      heroEl.innerHTML = isVideo
        ? `<video src="${this.escapeHtml(url)}" alt="" muted playsinline></video>`
        : `<img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(name)}" loading="eager">`;
    } else {
      heroEl.innerHTML = '<div class="studio-hero-placeholder"><i class="ph ph-image"></i><span>Sin portada</span></div>';
    }
  }

  /** Rellena el formulario de programación (schedule_schema) para flujos automáticos. */
  renderScheduleForm(flow) {
    const formEl = document.getElementById('studioScheduleForm');
    if (!formEl || !flow) return;
    const schema = flow.schedule_schema || {};
    let fields = Array.isArray(schema.fields) ? schema.fields : [];
    // Flujos antiguos pueden no tener tipo_entidad: inyectarlo para mostrar image_selector/dropdown en Entidad
    const hasTipoEntidad = fields.some(f => (f.key || f.name) === 'tipo_entidad');
    const hasEntityId = fields.some(f => (f.key || f.name) === 'entity_id');
    if (hasEntityId && !hasTipoEntidad) {
      const entityIdx = fields.findIndex(f => (f.key || f.name) === 'entity_id');
      const tipoField = {
        key: 'tipo_entidad',
        label: 'Tipo de entidad',
        input_type: 'select',
        required: true,
        options: [{ value: 'productos', label: 'Productos' }, { value: 'servicio', label: 'Servicio' }],
        defaultValue: 'productos'
      };
      fields = [...fields.slice(0, entityIdx), tipoField, ...fields.slice(entityIdx)];
    }
    if (fields.length === 0) {
      formEl.innerHTML = '<p class="studio-form-empty">Este flujo no tiene campos de programación definidos.</p>';
      return;
    }
    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      formEl.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'studio-schedule-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      if (Registry.initFormPickers) Registry.initFormPickers(formEl);
      this._applyScheduleFormEntityByType(formEl);
    } else {
      formEl.innerHTML = fields.map(f => this.renderFormField(f)).join('');
    }
  }

  /**
   * Genera el HTML del control Entidad según tipo_entidad: productos → image_selector (carrusel múltiple), servicio → dropdown.
   */
  _renderScheduleEntityControl(tipoEntidad) {
    const id = 'studio-schedule-entity_id';
    const name = 'entity_id';
    if (tipoEntidad === 'productos') {
      return (
        '<div class="image-selector-carousel" data-media-source="products" data-selection-mode="multiple" data-key="entity_id" data-field-name="' + name + '">' +
        '<div class="image-selector-carousel-track image-selector-carousel-track--empty" data-empty-msg="Selecciona producto(s)..."></div>' +
        '<input type="hidden" id="' + id + '" name="' + name + '" value="">' +
        '</div>'
      );
    }
    return (
      '<div class="input-dropdown-wrap">' +
      '<select class="modern-input input-dropdown-select" id="' + id + '" name="' + name + '">' +
      '<option value="">Selecciona un servicio...</option>' +
      '</select>' +
      '</div>'
    );
  }

  /**
   * Si el schema tiene tipo_entidad y entity_id, reemplaza el control Entidad por image_selector (productos) o dropdown (servicio).
   */
  _applyScheduleFormEntityByType(formEl) {
    const tipoWrapper = formEl.querySelector('.studio-field[data-key="tipo_entidad"]');
    const entityWrapper = formEl.querySelector('.studio-field[data-key="entity_id"]');
    if (!tipoWrapper || !entityWrapper) return;
    const tipoSelect = formEl.querySelector('select[name="tipo_entidad"]');
    if (!tipoSelect) return;
    const controlSlot = entityWrapper.children[1];
    if (!controlSlot) return;
    const container = document.createElement('div');
    container.className = 'studio-entity-control-slot';
    const update = () => {
      const value = tipoSelect.value || 'productos';
      container.innerHTML = this._renderScheduleEntityControl(value);
      if (value === 'productos') {
        const carousels = container.querySelectorAll('.image-selector-carousel');
        if (carousels.length) this._fillProductCarousels(Array.from(carousels));
      }
    };
    update();
    controlSlot.replaceWith(container);
    tipoSelect.addEventListener('change', update);
  }

  renderFlowForm(flow) {
    const titleEl = document.getElementById('studioFormTitle');
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl || !flow) return;

    if (titleEl) titleEl.textContent = flow.name;

    const schema = flow.input_schema || {};
    const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
    if (!Array.isArray(fields) || fields.length === 0) {
      formEl.innerHTML = '<p class="studio-form-empty">Este flujo no requiere datos adicionales.</p>';
      return;
    }

    const Registry = window.InputRegistry;
    if (Registry && Registry.renderFormFromSchema) {
      formEl.innerHTML = Registry.renderFormFromSchema(fields, {
        idPrefix: 'studio-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true
      });
      if (Registry.initFormPickers) Registry.initFormPickers(formEl);
    } else {
      formEl.innerHTML = fields.map(f => this.renderFormField(f)).join('');
      if (Registry && Registry.initFormPickers) Registry.initFormPickers(formEl);
      else if (Registry) {
        if (Registry.initColorsPicker) Registry.initColorsPicker(formEl);
        if (Registry.initAspectRatioPicker) Registry.initAspectRatioPicker(formEl);
      }
    }

    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => this.updateCreditsDisplay());
      el.addEventListener('change', () => this.updateCreditsDisplay());
    });

    // Poblar carruseles, selectores de enfoque y colores por defecto desde la marca
    setTimeout(() => {
      this.populateImageSelectorCarousels();
      this.populateFocusSelectorAccordions();
      this.populateColoresFromBrand();
    }, 0);
  }

  /**
   * Obtiene los hex de colores de la marca (brand_colors) para un brand_container_id. Máx. 6.
   * Solo lectura; no modifica la marca. Usado para prellenar el campo "colores" en el formulario.
   */
  async getBrandColorsForContainer(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const { data: brand, error: e1 } = await this.supabase
        .from('brands')
        .select('id')
        .eq('project_id', brandContainerId)
        .maybeSingle();
      if (e1 || !brand) return [];
      const { data: colors, error: e2 } = await this.supabase
        .from('brand_colors')
        .select('hex_value')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: true });
      if (e2 || !colors || colors.length === 0) return [];
      const seen = new Set();
      const hexes = [];
      for (const row of colors) {
        const raw = (row.hex_value || '').trim().replace(/^#/, '');
        if (!/^[0-9A-Fa-f]{6}$/.test(raw)) continue;
        const hex = '#' + raw;
        if (!seen.has(hex)) {
          seen.add(hex);
          hexes.push(hex);
          if (hexes.length >= 6) break;
        }
      }
      return hexes;
    } catch (e) {
      console.error('Studio getBrandColorsForContainer:', e);
      return [];
    }
  }

  /**
   * Prellena los campos "colores" vacíos con los colores de la marca. Solo afecta al valor del formulario (JSON del webhook); no modifica brand_colors.
   */
  async populateColoresFromBrand() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;
    const wraps = formEl.querySelectorAll('.input-colors-wrap[data-colors-brand-style="1"]');
    if (wraps.length === 0) return;
    const brandContainerId = await this.getBrandContainerId();
    const brandHexes = brandContainerId ? await this.getBrandColorsForContainer(brandContainerId) : [];
    if (brandHexes.length === 0) return;
    const maxDefault = 6;
    const hexList = brandHexes.slice(0, maxDefault);
    wraps.forEach(wrap => {
      const hidden = wrap.previousElementSibling;
      if (!hidden || !hidden.classList.contains('input-colors-value')) return;
      const current = (hidden.value || '').split(',').map(s => s.trim()).filter(Boolean);
      if (current.length > 0) return;
      const max = Math.max(1, Math.min(12, parseInt(wrap.getAttribute('data-colors-max'), 10) || 6));
      const list = hexList.slice(0, max);
      hidden.value = list.join(',');
      wrap._colorsInit = false;
      wrap.innerHTML = list.map(hex =>
        `<div class="color-swatch" style="background:${hex};" data-hex="${hex}"><button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button></div>`
      ).join('') + (list.length < max
        ? '<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>'
        : '');
    });
    if (window.InputRegistry && window.InputRegistry.initColorsPicker) {
      window.InputRegistry.initColorsPicker(formEl);
    }
    if (window.InputRegistry && window.InputRegistry.initAspectRatioPicker) {
      window.InputRegistry.initAspectRatioPicker(formEl);
    }
  }

  /**
   * Obtiene el brand_container_id para cargar productos de la marca del usuario.
   * 1) Intenta por organización (brand_containers.organization_id).
   * 2) Si no hay marca en la org, fallback por usuario (brand_containers.user_id) para que el usuario vea sus productos.
   * Misma relación que en products.js: products.brand_container_id → brand_containers.id
   */
  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      // 1) Marca de la organización (cuando la org tiene brand_containers con organization_id)
      if (this.organizationId) {
        const { data: byOrg, error: errOrg } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!errOrg && byOrg && byOrg.id) return byOrg.id;
      }
      // 2) Fallback: marca del usuario (user_id), como en products.js
      if (this.userId) {
        const { data: byUser, error: errUser } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!errUser && byUser && byUser.id) return byUser.id;
      }
      return null;
    } catch (e) {
      console.error('Studio getBrandContainerId:', e);
      return null;
    }
  }

  /**
   * Carga productos con sus imágenes (misma lógica que products.js loadProducts).
   * Tablas: products (brand_container_id), product_images (product_id, image_url, image_type, image_order).
   * Devuelve array de productos con .images = [{ image_url, image_type, image_order }, ...].
   * Imagen principal: primera de la lista o la que tenga image_type === 'principal'.
   */
  async loadProductsWithImages(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('id, nombre_producto, tipo_producto, brand_container_id, created_at')
        .eq('brand_container_id', brandContainerId)
        .order('created_at', { ascending: false });

      if (productsError || !products || products.length === 0) return [];

      const productIds = products.map(p => p.id).filter(Boolean);
      const imagesQuery = this.supabase
        .from('product_images')
        .select('id, product_id, image_url, image_type, image_order')
        .order('image_order', { ascending: true });
      const { data: allImages, error: imagesError } = productIds.length === 1
        ? await imagesQuery.eq('product_id', productIds[0])
        : await imagesQuery.in('product_id', productIds);

      if (!imagesError && allImages && allImages.length > 0) {
        const byProduct = {};
        allImages.forEach(img => {
          if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
          byProduct[img.product_id].push(img);
        });
        products.forEach(p => {
          const imgs = byProduct[p.id] || [];
          // Ordenar: principal primero, luego por image_order
          p.images = imgs.sort((a, b) => {
            if (a.image_type === 'principal') return -1;
            if (b.image_type === 'principal') return 1;
            return (a.image_order ?? 0) - (b.image_order ?? 0);
          });
        });
      } else {
        products.forEach(p => { p.images = []; });
      }
      return products;
    } catch (e) {
      console.error('Studio loadProductsWithImages:', e);
      return [];
    }
  }

  /**
   * Rellena los carruseles .image-selector-carousel con productos cuando:
   * - data-media-source="products", o
   * - data-key/data-field-name contiene "product", o
   * - el label del wrapper (.studio-field) contiene "producto" (ej. "productos").
   * Usa la misma estructura de tarjeta que la biblioteca de productos.
   */
  async populateImageSelectorCarousels() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;

    const bySource = formEl.querySelectorAll('.image-selector-carousel[data-media-source="products"]');
    if (bySource.length > 0) {
      await this._fillProductCarousels(bySource);
      return;
    }
    const allCarousels = Array.from(formEl.querySelectorAll('.image-selector-carousel'));
    const byKey = allCarousels.filter(el => {
      const key = (el.getAttribute('data-key') || el.getAttribute('data-field-name') || '').toLowerCase();
      return key.includes('product');
    });
    if (byKey.length > 0) {
      await this._fillProductCarousels(byKey);
      return;
    }
    const byLabel = allCarousels.filter(carousel => {
      const wrapper = carousel.closest('.studio-field, .form-field');
      if (!wrapper) return false;
      const labelEl = wrapper.querySelector('label');
      const labelText = (labelEl && labelEl.textContent || '').trim().toLowerCase();
      return labelText.includes('producto');
    });
    if (byLabel.length > 0) {
      await this._fillProductCarousels(byLabel);
      return;
    }
    // Fallback: si hay un solo carrusel image_selector y no es "references", asumir productos (ej. flujo "Product Render")
    const notReferences = allCarousels.filter(el => el.getAttribute('data-media-source') !== 'references');
    if (notReferences.length === 1) {
      await this._fillProductCarousels(notReferences);
    }
  }

  /**
   * Rellena los carruseles dados con productos de la marca (internal).
   */
  async _fillProductCarousels(carousels) {
    const brandContainerId = await this.getBrandContainerId();
    if (!brandContainerId) {
      console.warn('[Studio] No se encontró marca: ni organization_id ni user_id tienen brand_containers. Comprueba que la org o el usuario tengan al menos una marca.');
    }
    const products = await this.loadProductsWithImages(brandContainerId);
    if (brandContainerId && (!products || products.length === 0)) {
      console.warn('[Studio] Marca encontrada pero sin productos. brand_container_id=', brandContainerId, '- Añade productos en la sección Productos de la app.');
    }

    const escapeHtml = (s) => {
      if (s == null) return '';
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    };

    carousels.forEach(carousel => {
      const track = carousel.querySelector('.image-selector-carousel-track');
      const hiddenInput = carousel.querySelector('input[type="hidden"]');
      const fieldName = carousel.getAttribute('data-field-name') || (hiddenInput && hiddenInput.getAttribute('name'));
      const isMultiple = carousel.getAttribute('data-selection-mode') === 'multiple';

      if (!track) return;

      track.classList.remove('image-selector-carousel-track--empty');
      track.removeAttribute('data-empty-msg');

      if (products.length === 0) {
        track.innerHTML = '<span class="image-selector-empty-msg">No hay productos en esta marca.</span>';
        if (hiddenInput) hiddenInput.value = isMultiple ? '[]' : '';
        return;
      }

      const selectedIds = new Set();

      track.innerHTML = products.map(product => {
        const mainImage = product.images && product.images.length > 0 ? product.images[0].image_url : null;
        const nombre = product.nombre_producto || 'Producto';
        const imgHtml = mainImage
          ? `<img src="${escapeHtml(mainImage)}" alt="${escapeHtml(nombre)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex');">`
          : '';
        const noImageHtml = '<div class="image-selector-card-placeholder" style="' + (mainImage ? 'display:none;' : '') + '"><i class="ph ph-image"></i></div>';
        return (
          '<div class="image-selector-card" data-product-id="' + escapeHtml(product.id) + '" role="button" tabindex="0">' +
          '<div class="image-selector-card-image">' + imgHtml + noImageHtml + '</div>' +
          '<span class="image-selector-card-label">' + escapeHtml(nombre) + '</span>' +
          '</div>'
        );
      }).join('');

      track.querySelectorAll('.image-selector-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-product-id');
          if (!id) return;
          if (isMultiple) {
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            card.classList.toggle('selected', selectedIds.has(id));
            if (hiddenInput) hiddenInput.value = JSON.stringify(Array.from(selectedIds));
          } else {
            track.querySelectorAll('.image-selector-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            if (hiddenInput) hiddenInput.value = id;
          }
          this.updateCreditsDisplay();
        });
      });

      if (hiddenInput) hiddenInput.value = isMultiple ? '[]' : '';
    });
  }

  async loadBrandData(brandContainerId) {
    if (!this.supabase || !brandContainerId) return null;
    try {
      const { data: container, error: e1 } = await this.supabase
        .from('brand_containers')
        .select('*')
        .eq('id', brandContainerId)
        .single();
      if (e1 || !container) return null;
      const { data: brand, error: e2 } = await this.supabase
        .from('brands')
        .select('*')
        .eq('project_id', brandContainerId)
        .maybeSingle();
      if (e2) return { ...container };
      return { ...container, ...(brand || {}) };
    } catch (e) {
      console.error('Studio loadBrandData:', e);
      return null;
    }
  }

  async loadCampaigns(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('campaigns')
        .select('*')
        .eq('brand_container_id', brandContainerId)
        .order('created_at', { ascending: false });
      return error ? [] : (data || []);
    } catch (e) {
      console.error('Studio loadCampaigns:', e);
      return [];
    }
  }

  async loadAudiences(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const { data: brand, error: e1 } = await this.supabase
        .from('brands')
        .select('id')
        .eq('project_id', brandContainerId)
        .maybeSingle();
      if (e1 || !brand) return [];
      const { data, error } = await this.supabase
        .from('audiences')
        .select('*')
        .eq('brand_id', brand.id);
      return error ? [] : (data || []);
    } catch (e) {
      console.error('Studio loadAudiences:', e);
      return [];
    }
  }

  async loadEntities(brandContainerId) {
    if (!this.supabase || !brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('brand_entities')
        .select('*')
        .eq('brand_container_id', brandContainerId)
        .order('created_at', { ascending: false });
      return error ? [] : (data || []);
    } catch (e) {
      console.error('Studio loadEntities:', e);
      return [];
    }
  }

  /**
   * Enlaza los acordeones scope_picker (enfoque de la producción): toggle "Que la IA decida" y checkboxes
   * de opciones ya renderizadas por el registry. Solo procesa data-focus-type="scope_picker".
   */
  populateFocusSelectorAccordions() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return;

    const accordions = formEl.querySelectorAll('.focus-selector-accordion[data-focus-type="scope_picker"]');
    for (const accordion of accordions) {
      const body = accordion.querySelector('.focus-selector-body');
      const hiddenInput = accordion.querySelector('input[type="hidden"]');
      const letAiCheckbox = accordion.querySelector('.focus-selector-let-ai-decide');
      if (!body || !hiddenInput) continue;

      const updateValue = () => {
        if (!hiddenInput) return;
        if (letAiCheckbox && letAiCheckbox.checked) {
          hiddenInput.value = '{"let_ai_decide":true}';
          return;
        }
        const values = [];
        accordion.querySelectorAll('.focus-selector-checkbox:checked').forEach(cb => {
          const v = cb.getAttribute('data-value');
          if (v != null) values.push(v);
        });
        hiddenInput.value = JSON.stringify({ let_ai_decide: false, values });
      };

      if (letAiCheckbox) {
        letAiCheckbox.addEventListener('change', () => {
          const custom = !letAiCheckbox.checked;
          body.classList.toggle('focus-selector-body--open', custom);
          body.setAttribute('aria-hidden', !custom);
          updateValue();
          this.updateCreditsDisplay();
        });
      }
      accordion.querySelectorAll('.focus-selector-checkbox').forEach(cb => {
        cb.addEventListener('change', () => { updateValue(); this.updateCreditsDisplay(); });
      });

      body.classList.toggle('focus-selector-body--open', !(letAiCheckbox && letAiCheckbox.checked));
      body.setAttribute('aria-hidden', !!(letAiCheckbox && letAiCheckbox.checked));
    }
  }

  renderFormField(field) {
    const name = field.name || field.key || field.id || 'field';
    const fieldNorm = { ...field, key: name, required: field.required !== false };
    if (typeof window.InputRegistry !== 'undefined' && window.InputRegistry.renderFormFieldWithWrapper) {
      return window.InputRegistry.renderFormFieldWithWrapper(fieldNorm, {
        idPrefix: 'studio-',
        wrapperClass: 'studio-field',
        showLabel: true,
        showHelper: true,
        showRequired: true,
        required: fieldNorm.required
      });
    }
    const label = field.label || name;
    const required = fieldNorm.required;
    const type = (field.type || field.input_type || 'text').toLowerCase();
    const placeholder = field.placeholder || '';
    if (type === 'textarea') {
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><textarea id="studio-${name}" name="${this.escapeHtml(name)}" rows="3" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''}></textarea></div>`;
    }
    if (type === 'number') {
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><input type="number" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} /></div>`;
    }
    if (type === 'select') {
      const options = field.options || [];
      const opts = options.map(o => `<option value="${this.escapeHtml(String(o.value ?? o))}">${this.escapeHtml(String(o.label ?? o))}</option>`).join('');
      return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><select id="studio-${name}" name="${this.escapeHtml(name)}" ${required ? 'required' : ''}><option value="">Seleccionar...</option>${opts}</select></div>`;
    }
    return `<div class="studio-field"><label for="studio-${name}">${this.escapeHtml(label)}</label><input type="text" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} /></div>`;
  }

  collectFormData() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return {};
    const data = {};
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const name = el.getAttribute('name');
      if (!name) return;
      if (el.type === 'checkbox') data[name] = el.checked;
      else {
        const raw = el.value?.trim() ?? '';
        if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
          try {
            data[name] = JSON.parse(raw);
          } catch (_) {
            data[name] = raw;
          }
        } else {
          data[name] = raw;
        }
      }
    });
    return data;
  }

  /**
   * Detecta si un campo del schema es selector de productos (image_selector de productos).
   */
  _isProductSelectorField(field) {
    const type = (field.input_type || field.type || '').toLowerCase();
    if (type !== 'image_selector') return false;
    const source = (field.media_source || field.function_type || '').toLowerCase();
    if (source === 'products') return true;
    const key = (field.key || field.name || '').toLowerCase();
    return key.includes('product');
  }

  /**
   * Reemplaza en el payload los campos "selector de productos" (UUID o array de UUIDs)
   * por el objeto completo de cada producto (con imágenes y todos los datos de BD), vía RPC get_products_full_by_ids.
   * El webhook recibe así todos los datos del producto, no solo el ID.
   */
  async enrichProductPayload(payload) {
    if (!this.supabase || !this.selectedFlow) return payload;
    const schema = this.selectedFlow.input_schema || {};
    const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
    if (!Array.isArray(fields) || fields.length === 0) return payload;

    const productFields = fields.filter(f => this._isProductSelectorField(f));
    if (productFields.length === 0) return payload;

    const out = { ...payload };
    for (const field of productFields) {
      const key = field.key || field.name;
      if (!key || out[key] == null) continue;
      let ids = out[key];
      if (typeof ids === 'string') {
        const trimmed = ids.trim();
        if (!trimmed) continue;
        ids = [trimmed];
      }
      if (!Array.isArray(ids) || ids.length === 0) continue;
      const validIds = ids.filter(id => typeof id === 'string' && id.length > 0);
      if (validIds.length === 0) continue;

      try {
        const { data, error } = await this.supabase.rpc('get_products_full_by_ids', { p_product_ids: validIds });
        if (error) {
          console.warn('[Studio] get_products_full_by_ids:', error.message);
          continue;
        }
        const list = Array.isArray(data) ? data : [];
        out[key] = list.length === 1 && validIds.length === 1 ? list[0] : list;
      } catch (e) {
        console.warn('[Studio] enrichProductPayload:', e);
      }
    }
    return out;
  }

  setupEventListeners() {
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.addEventListener('click', () => this.producir());

    const showFlowsList = () => {
      this.selectedFlow = null;
      const listEl = document.getElementById('studioFlowsList');
      const formWrap = document.getElementById('studioFlowFormWrap');
      if (listEl) listEl.style.display = '';
      if (formWrap) formWrap.style.display = 'none';
      this.updateCreditsDisplay();
      const b = document.getElementById('studioProducirBtn');
      if (b) b.disabled = true;
      if (window.router) window.router.navigate(this.getStudioBasePath() + '/flows', true);
    };

    const backFlows = document.getElementById('studioBackFlows');
    if (backFlows) backFlows.addEventListener('click', showFlowsList);

    const backFlowsAutomated = document.getElementById('studioBackFlowsAutomated');
    if (backFlowsAutomated) backFlowsAutomated.addEventListener('click', showFlowsList);
  }

  async producir() {
    if (!this.selectedFlow || !this.selectedFlow.webhook_url) return;
    const cost = this.selectedFlow.token_cost ?? 1;
    if (this.credits.available < cost) {
      this._notify('Créditos insuficientes para esta producción.');
      return;
    }

    const Service = window.FlowWebhookService;
    if (!Service || typeof Service.executeWebhook !== 'function') {
      this._notify('Servicio de ejecución no disponible. Recarga la página.');
      return;
    }

    let payload = this.collectFormData();
    payload = await this.enrichProductPayload(payload);
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.disabled = true;

    const timeoutMs = DEFAULT_STUDIO_TIMEOUT_MS;
    const maxRetries = DEFAULT_STUDIO_MAX_RETRIES;
    let runId = null;
    let creditsDeducted = false;

    try {
      // 1) Deducción atómica de créditos + creación de run (RPC)
      const { data: deductResult, error: rpcError } = await this.supabase
        .rpc('deduct_credits_and_create_run', {
          p_organization_id: this.organizationId,
          p_user_id: this.userId,
          p_flow_id: this.selectedFlow.id,
          p_amount: cost
        });

      if (rpcError) {
        console.error('Studio deduct RPC:', rpcError);
        this._notify('No se pudo reservar créditos. Intenta de nuevo.');
        return;
      }

      const success = deductResult?.success === true;
      runId = deductResult?.run_id;
      if (!success || !runId) {
        const msg = deductResult?.error_message === 'insufficient_credits'
          ? 'Créditos insuficientes para esta producción.'
          : (deductResult?.error_message || 'Error al reservar créditos.');
        this._notify(msg);
        return;
      }

      creditsDeducted = true;
      this.credits.available = deductResult.new_available ?? this.credits.available - cost;
      this.updateCreditsDisplay();

      // 2) Ejecutar webhook con reintentos y timeout
      const res = await Service.executeWebhook({
        url: this.selectedFlow.webhook_url,
        method: (this.selectedFlow.webhook_method || 'POST').toUpperCase(),
        body: payload,
        timeoutMs,
        maxRetries
      });

      if (!res.ok) {
        await this._refundCreditsSafe(runId, cost);
        this.credits.available += cost;
        this.updateCreditsDisplay();
        await this.loadCredits();
        if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
          await window.appNavigation.loadCreditsFromDb(this.organizationId);
        }
        const detail = res.error || res.statusText || `Código ${res.status}`;
        if (res.status === 400) {
          this._notify('Solicitud incorrecta: ' + detail + '. Revisa los datos del formulario.');
        } else if (res.status >= 500) {
          this._notify('Error del servidor del flujo. Intenta más tarde o contacta al administrador.');
        } else {
          this._notify('Error en la producción: ' + detail);
        }
        return;
      }

      // 3) Marcar run como completado
      await this.supabase
        .from('flow_runs')
        .update({
          status: 'completed',
          webhook_response_code: res.status,
          tokens_consumed: cost
        })
        .eq('id', runId);

      await this.loadCredits();
      this.updateCreditsDisplay();
      if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
        await window.appNavigation.loadCreditsFromDb(this.organizationId);
      }
      this._notify('Producción enviada correctamente.');
    } catch (e) {
      if (creditsDeducted && runId) {
        await this._refundCreditsSafe(runId, cost);
        this.credits.available += cost;
        this.updateCreditsDisplay();
        await this.loadCredits();
        if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
          await window.appNavigation.loadCreditsFromDb(this.organizationId);
        }
      }
      const msg = this._messageForProducirError(e);
      console.error('Studio producir:', e);
      this._notify(msg);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _refundCreditsSafe(runId, amount) {
    try {
      await this.supabase.rpc('refund_credits_for_run', {
        p_organization_id: this.organizationId,
        p_run_id: runId,
        p_amount: amount
      });
    } catch (refundErr) {
      console.error('Studio refund fallback:', refundErr);
    }
  }

  _messageForProducirError(e) {
    if (e.name === 'AbortError') {
      return 'Tiempo de espera agotado. El servidor no respondió a tiempo.';
    }
    if (e.name === 'TypeError' && e.cause) {
      return 'Error de conexión. Comprueba tu red e intenta de nuevo.';
    }
    if (e.message && typeof e.message === 'string') {
      return e.message;
    }
    return 'Error al producir. Intenta de nuevo.';
  }

  async onLeave() {
    this.cleanup();
    window.studioView = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.flows = [];
    this.selectedFlow = null;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.StudioView = StudioView;
