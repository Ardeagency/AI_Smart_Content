/**
 * IdentitiesView — Secciones de servicios y productos.
 * - Servicios: carrusel horizontal
 * - Productos: masonry como Production (imagen a proporción natural, nombre solo en hover)
 */
class IdentitiesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.services = [];
    this.products = [];
    this.productImageById = {};
    this._fallbackEntityId = null;
    this._onResizeBound = null;
  }

  renderHTML() {
    return `
<div class="identities-page" id="identitiesPage">
  <div class="identities-header">
    <h1 class="identities-title">Identities</h1>
    <div class="identities-header-actions">
      <button type="button" class="identities-add-btn" id="identitiesAddProductBtn" aria-label="Agregar producto">
        <span>+ Producto</span>
      </button>
      <button type="button" class="identities-add-btn" id="identitiesAddServiceBtn" aria-label="Agregar servicio">
        <span>+ Servicio</span>
      </button>
    </div>
  </div>

  <section class="identities-section" id="identitiesServicesSection" style="display:none;">
    <div class="identities-section-head">
      <div class="identities-section-head-main">
        <h2 class="identities-section-title">Servicios</h2>
        <span class="identities-section-count" id="servicesCount">0</span>
      </div>
    </div>
    <div class="identities-services-carousel-wrap">
      <div class="identities-services-carousel" id="identitiesServicesCarousel"></div>
    </div>
  </section>

  <section class="identities-section" id="identitiesProductsSection" style="display:none;">
    <div class="identities-section-head">
      <div class="identities-section-head-main">
        <h2 class="identities-section-title">Productos</h2>
        <span class="identities-section-count" id="productsCount">0</span>
      </div>
    </div>
    <div class="identities-products-masonry" id="identitiesProductsMasonry"></div>
  </section>
</div>`;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
  }

  async render() {
    await super.render();
    await this._initSupabase();
    await this._loadData();
    this._renderServices();
    this._renderProductsMasonry();
    this._setupEventListeners();
  }

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('IdentitiesView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.services = [];
      this.products = [];
      this.productImageById = {};
      return;
    }

    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchIdentitiesData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`identities:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();

      this.services = result.services;
      this.products = result.products;
      this.productImageById = result.productImageById;
      this._fallbackEntityId = result.fallbackEntityId;
    } catch (e) {
      console.error('IdentitiesView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'IdentitiesView._loadData' });
      this.services = [];
      this.products = [];
      this.productImageById = {};
      this._fallbackEntityId = null;
    }
  }

  async _fetchIdentitiesData(orgId) {
    const [servicesRes, productsRes] = await Promise.all([
      this.supabase
        .from('services')
        .select('id, entity_id, nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda, beneficios_principales')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('products')
        .select('id, entity_id, nombre_producto, descripcion_producto, tipo_producto, precio_producto, moneda')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
    ]);

    if (servicesRes.error) throw servicesRes.error;
    if (productsRes.error) throw productsRes.error;

    const services = servicesRes.data || [];
    const products = productsRes.data || [];

    const productIds = products.map((p) => p.id);
    const productImageById = {};
    if (productIds.length) {
      const { data: imagesData, error: imagesError } = await this.supabase
        .from('product_images')
        .select('product_id, image_url, image_order')
        .in('product_id', productIds)
        .not('image_url', 'is', null)
        .order('image_order', { ascending: true });
      if (imagesError) throw imagesError;
      (imagesData || []).forEach((img) => {
        const url = (img.image_url || '').trim();
        if (!url) return;
        if (!productImageById[img.product_id]) productImageById[img.product_id] = url;
      });
    }

    let fallbackEntityId = null;
    const orphan = products.some((p) => !p.entity_id);
    if (orphan) {
      const { data: ents } = await this.supabase
        .from('brand_entities')
        .select('id')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1);
      fallbackEntityId = ents?.[0]?.id || null;
    }

    return { services, products, productImageById, fallbackEntityId };
  }

  /** Invalida cache cuando se crea/borra un servicio/producto desde esta vista. */
  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`identities:${this.organizationId}`);
    }
  }

  /**
   * Primera brand_entity de la organizacion, o una por defecto si no existe (FK servicios/productos).
   */
  async _ensureEntityId() {
    if (!this.supabase || !this.organizationId) return null;
    const { data: rows, error } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.error('IdentitiesView _ensureEntityId:', error);
      return null;
    }
    if (rows?.length) return rows[0].id;

    const { data: created, error: insErr } = await this.supabase
      .from('brand_entities')
      .insert({
        organization_id: this.organizationId,
        name: 'Identity principal',
        entity_type: 'other',
        description: null,
      })
      .select('id')
      .single();
    if (insErr) {
      console.error('IdentitiesView _ensureEntityId insert:', insErr);
      return null;
    }
    return created?.id || null;
  }

  _navigateToProductDetail(entityId, productId) {
    if (!entityId || !productId || !window.router) return;
    const orgId = this.routeParams?.orgId;
    const orgSlug = this.routeParams?.orgNameSlug;
    let url;
    if (orgId && orgSlug && typeof window.getOrgPathPrefix === 'function') {
      url = `${window.getOrgPathPrefix(orgId, orgSlug)}/product-detail/${entityId}/${productId}`;
    } else if (orgId && orgSlug) {
      url = `/org/${orgId}/${orgSlug}/product-detail/${entityId}/${productId}`;
    } else {
      url = `/product-detail/${entityId}/${productId}`;
    }
    window.router.navigate(url, true);
  }

  async _onAddService() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('identitiesAddServiceBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) {
        alert('No se pudo obtener una identidad para vincular el servicio.');
        return;
      }
      const { error } = await this.supabase.from('services').insert({
        organization_id: this.organizationId,
        entity_id: entityId,
        nombre_servicio: 'Nuevo servicio',
        descripcion_servicio: null,
      });
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderServices();
    } catch (e) {
      console.error('IdentitiesView _onAddService:', e);
      alert(e?.message || 'Error al crear el servicio');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _onAddProduct() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('identitiesAddProductBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) {
        alert('No se pudo obtener una identidad para vincular el producto.');
        return;
      }
      const { data, error } = await this.supabase
        .from('products')
        .insert({
          organization_id: this.organizationId,
          entity_id: entityId,
          tipo_producto: 'otro',
          nombre_producto: 'nuevo producto',
          descripcion_producto: 'Pendiente de descripción.',
          moneda: 'USD',
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data?.id) return;
      this._invalidateCache();
      this._navigateToProductDetail(entityId, data.id);
    } catch (e) {
      console.error('IdentitiesView _onAddProduct:', e);
      alert(e?.message || 'Error al crear el producto');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderServices() {
    const section = document.getElementById('identitiesServicesSection');
    const carousel = document.getElementById('identitiesServicesCarousel');
    const count = document.getElementById('servicesCount');
    if (!carousel) return;

    if (count) count.textContent = String(this.services.length || 0);

    if (!this.services.length) {
      carousel.innerHTML = '';
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    carousel.innerHTML = this.services.map((s) => {
      const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : '';
      const tags = (s.beneficios_principales || []).slice(0, 3);
      return `
        <article class="identities-service-card">
          <h3 class="identities-service-title">${this.escapeHtml(s.nombre_servicio || 'Servicio')}</h3>
          ${s.descripcion_servicio ? `<p class="identities-service-desc">${this.escapeHtml(s.descripcion_servicio)}</p>` : ''}
          <div class="identities-service-meta">
            ${price ? `<span class="identities-service-price">${this.escapeHtml(price)}</span>` : ''}
            ${s.duracion_estimada ? `<span class="identities-service-duration"><i class="fas fa-clock"></i> ${this.escapeHtml(s.duracion_estimada)}</span>` : ''}
          </div>
          ${tags.length ? `<div class="identities-service-tags">${tags.map((t) => `<span class="service-tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </article>
      `;
    }).join('');
  }

  /** Debe coincidir con columnas en identities.css (máx. 3 para tarjetas más grandes). */
  _getMasonryColumns() {
    const w = window.innerWidth || 1200;
    if (w >= 992) return 3;
    if (w >= 640) return 2;
    return 1;
  }

  _renderProductsMasonry() {
    const section = document.getElementById('identitiesProductsSection');
    const container = document.getElementById('identitiesProductsMasonry');
    const count = document.getElementById('productsCount');
    if (!container) return;

    if (count) count.textContent = String(this.products.length || 0);

    if (!this.products.length) {
      container.innerHTML = '';
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    const colsCount = this._getMasonryColumns();
    const cols = Array.from({ length: colsCount }, () => []);
    this.products.forEach((p, i) => {
      cols[i % colsCount].push(this._renderProductCard(p, i));
    });

    container.innerHTML = `
      <div class="identities-masonry-grid">
        ${cols.map((col) => `<div class="identities-masonry-column">${col.join('')}</div>`).join('')}
      </div>
    `;

    container.querySelectorAll('.identity-product-card').forEach((card) => {
      const open = () => {
        const productId = card.getAttribute('data-product-id');
        const entityId = card.getAttribute('data-entity-id');
        if (!productId || !entityId) return;
        this._navigateToProductDetail(entityId, productId);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  _renderProductCard(p, _i) {
    const imageUrl = this.productImageById[p.id] || '';
    const name = p.nombre_producto || 'Producto';
    const entityId = p.entity_id || this._fallbackEntityId || '';
    const safeName = this.escapeHtml(name);
    return `
      <div class="living-masonry-item">
        <article class="history-image-card identity-product-card" data-product-id="${p.id}" data-entity-id="${entityId}" role="button" tabindex="0" aria-label="${safeName}">
          ${imageUrl
            ? `<img src="${this.escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="this.parentNode.classList.add('identity-product-card-broken'); this.outerHTML='<div class=&quot;identity-product-card-placeholder&quot;><i class=&quot;fas fa-image&quot; aria-hidden=&quot;true&quot;></i></div>';">`
            : `<div class="identity-product-card-placeholder"><i class="fas fa-image" aria-hidden="true"></i></div>`
          }
          <div class="history-card-flow-name">${safeName}</div>
        </article>
      </div>
    `;
  }

  _setupEventListeners() {
    if (!this._onResizeBound) {
      this._onResizeBound = () => this._renderProductsMasonry();
      window.addEventListener('resize', this._onResizeBound);
    }
    const addServiceBtn = document.getElementById('identitiesAddServiceBtn');
    const addProductBtn = document.getElementById('identitiesAddProductBtn');
    if (addServiceBtn) addServiceBtn.onclick = () => this._onAddService();
    if (addProductBtn) addProductBtn.onclick = () => this._onAddProduct();
  }

  async onLeave() {
    if (this._onResizeBound) {
      window.removeEventListener('resize', this._onResizeBound);
      this._onResizeBound = null;
    }
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.IdentitiesView = IdentitiesView;
