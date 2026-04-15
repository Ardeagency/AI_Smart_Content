/**
 * IdentitiesView — Secciones de servicios y productos.
 * - Servicios: carrusel horizontal
 * - Productos: galeria masonry (estilo Production)
 */
class IdentitiesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.services = [];
    this.products = [];
    this.productImageById = {};
    this._onResizeBound = null;
  }

  renderHTML() {
    return `
<div class="identities-page" id="identitiesPage">
  <div class="identities-header">
    <h1 class="identities-title">Identities</h1>
  </div>

  <section class="identities-section">
    <div class="identities-section-head">
      <h2 class="identities-section-title">Servicios</h2>
      <span class="identities-section-count" id="servicesCount">0</span>
    </div>
    <div class="identities-services-carousel-wrap">
      <div class="identities-services-carousel" id="identitiesServicesCarousel"></div>
    </div>
    <div class="identities-empty" id="servicesEmpty" style="display:none;">
      <i class="fas fa-concierge-bell"></i>
      <p>No hay servicios para esta organizacion.</p>
    </div>
  </section>

  <section class="identities-section">
    <div class="identities-section-head">
      <h2 class="identities-section-title">Productos</h2>
      <span class="identities-section-count" id="productsCount">0</span>
    </div>
    <div class="identities-products-masonry" id="identitiesProductsMasonry"></div>
    <div class="identities-empty" id="productsEmpty" style="display:none;">
      <i class="fas fa-box-open"></i>
      <p>No hay productos para esta organizacion.</p>
    </div>
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

    try {
      const [servicesRes, productsRes] = await Promise.all([
        this.supabase
          .from('services')
          .select('id, entity_id, nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda, beneficios_principales')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: false }),
        this.supabase
          .from('products')
          .select('id, entity_id, nombre_producto, descripcion_producto, tipo_producto, precio_producto, moneda')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: false })
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (productsRes.error) throw productsRes.error;

      this.services = servicesRes.data || [];
      this.products = productsRes.data || [];

      const productIds = this.products.map((p) => p.id);
      this.productImageById = {};
      if (productIds.length) {
        const { data: imagesData, error: imagesError } = await this.supabase
          .from('product_images')
          .select('product_id, image_url, image_order')
          .in('product_id', productIds)
          .order('image_order', { ascending: true });
        if (imagesError) throw imagesError;
        (imagesData || []).forEach((img) => {
          if (!this.productImageById[img.product_id]) {
            this.productImageById[img.product_id] = img.image_url;
          }
        });
      }
    } catch (e) {
      console.error('IdentitiesView _loadData:', e);
      this.services = [];
      this.products = [];
      this.productImageById = {};
    }
  }

  _renderServices() {
    const carousel = document.getElementById('identitiesServicesCarousel');
    const empty = document.getElementById('servicesEmpty');
    const count = document.getElementById('servicesCount');
    if (!carousel) return;

    if (count) count.textContent = String(this.services.length || 0);

    if (!this.services.length) {
      carousel.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

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

  _getMasonryColumns() {
    const w = window.innerWidth || 1200;
    if (w >= 1280) return 5;
    if (w >= 1024) return 4;
    if (w >= 768) return 3;
    return 2;
  }

  _renderProductsMasonry() {
    const container = document.getElementById('identitiesProductsMasonry');
    const empty = document.getElementById('productsEmpty');
    const count = document.getElementById('productsCount');
    if (!container) return;

    if (count) count.textContent = String(this.products.length || 0);

    if (!this.products.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

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
      card.addEventListener('click', () => {
        const productId = card.getAttribute('data-product-id');
        const entityId = card.getAttribute('data-entity-id');
        if (!productId || !entityId || !window.router) return;
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
      });
    });
  }

  _renderProductCard(p, i) {
    const imageUrl = this.productImageById[p.id] || '';
    const price = p.precio_producto != null ? `${p.precio_producto} ${p.moneda || 'USD'}` : '';
    return `
      <div class="living-masonry-item">
        <article class="history-image-card identity-product-card" data-product-id="${p.id}" data-entity-id="${p.entity_id || ''}" role="button" tabindex="0">
          ${imageUrl
            ? `<img class="identity-product-card-image" src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(p.nombre_producto || 'Producto')}" loading="lazy">`
            : `<div class="identity-product-card-image identity-product-card-image--empty"><i class="fas fa-image"></i></div>`
          }
          <div class="history-card-flow-name identity-product-flow-name">
            <div class="identity-product-card-title">${this.escapeHtml(p.nombre_producto || 'Producto')}</div>
            <div class="identity-product-card-meta">
              ${price ? `<span class="identity-product-card-price">${this.escapeHtml(price)}</span>` : ''}
              ${p.tipo_producto ? `<span class="identity-product-card-type">${this.escapeHtml(p.tipo_producto)}</span>` : ''}
            </div>
          </div>
        </article>
      </div>
    `;
  }

  _setupEventListeners() {
    if (!this._onResizeBound) {
      this._onResizeBound = () => this._renderProductsMasonry();
      window.addEventListener('resize', this._onResizeBound);
    }
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
