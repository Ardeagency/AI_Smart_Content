/**
 * StudioView - Vista principal del Estudio de Generación de Contenido (SaaS)
 * 
 * PRODUCTO FINAL PARA USUARIOS CONSUMIDORES
 * 
 * Layout basado en studio-v1.html:
 * - Área central (canvas) para visualizar outputs
 * - Sidebar derecho con configuraciones en acordeones
 * - Integración con PaaS (flujos dinámicos de content_flows)
 * 
 * Flujo del usuario:
 * 1. Seleccionar marca
 * 2. Seleccionar producto/servicio (opcional)
 * 3. Elegir tipo de contenido (flujo)
 * 4. Configurar parámetros
 * 5. Generar contenido
 */

class StudioView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    
    // Datos del usuario
    this.brands = [];
    this.selectedBrand = null;
    this.products = [];
    this.selectedProduct = null;
    this.productImages = [];
    
    // Flujos disponibles
    this.flows = [];
    this.selectedFlow = null;
    
    // Datos del formulario
    this.formData = {};
    
    // Estado de generación
    this.isGenerating = false;
    this.generatedOutputs = [];
    
    // Acordeones abiertos
    this.openAccordions = new Set();
    
    // Créditos
    this.credits = { available: 0, total: 0 };
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    // Obtener orgId de los parámetros de ruta o del estado
    this.organizationId = this.routeParams?.orgId || 
                          window.appState?.get('selectedOrganizationId') ||
                          localStorage.getItem('selectedOrganizationId');
    
    // Si no hay orgId, redirigir a hogar para seleccionar organización
    if (!this.organizationId) {
      window.router?.navigate('/hogar');
      return;
    }

    // Guardar orgId para uso futuro
    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <!-- Header del Estudio -->
      <header class="studio-header">
        <div class="studio-header-content">
          <div class="studio-header-left">
            <h1>
              <span>Estudio</span>
              <span class="header-separator">&gt;</span>
              <span class="header-context" id="headerContext">Crear contenido</span>
            </h1>
          </div>
          <div class="studio-header-right">
            <div class="studio-credits" id="studioCredits">
              <i class="ph ph-coins"></i>
              <span id="creditsValue">0</span>
              <span class="credits-label">créditos</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Layout Principal del Studio -->
      <div class="studio-layout">
        <!-- Área Central - Canvas para Outputs -->
        <main class="studio-canvas">
          <!-- Estado inicial - Instrucciones -->
          <div class="canvas-welcome" id="canvasWelcome">
            <div class="welcome-icon">
              <i class="ph ph-magic-wand"></i>
            </div>
            <h2>Bienvenido al Estudio</h2>
            <p>Configura los parámetros en el panel derecho y genera contenido increíble con IA</p>
            <div class="welcome-steps">
              <div class="welcome-step">
                <span class="step-number">1</span>
                <span>Selecciona tu marca</span>
              </div>
              <div class="welcome-step">
                <span class="step-number">2</span>
                <span>Elige un producto (opcional)</span>
              </div>
              <div class="welcome-step">
                <span class="step-number">3</span>
                <span>Selecciona el tipo de contenido</span>
              </div>
              <div class="welcome-step">
                <span class="step-number">4</span>
                <span>Personaliza y genera</span>
              </div>
            </div>
          </div>

          <!-- Estado de generación -->
          <div class="canvas-generating" id="canvasGenerating" style="display: none;">
            <div class="generating-animation">
              <div class="generating-spinner"></div>
              <i class="ph ph-sparkle"></i>
            </div>
            <h3>Generando contenido...</h3>
            <p id="generatingStatus">Preparando tu contenido con IA</p>
            <div class="generating-progress">
              <div class="progress-bar">
                <div class="progress-fill" id="generatingProgress"></div>
              </div>
            </div>
          </div>

          <!-- Container de Outputs -->
          <div class="canvas-outputs" id="canvasOutputs" style="display: none;">
            <div class="outputs-header">
              <h3>
                <i class="ph ph-check-circle"></i>
                Contenido Generado
              </h3>
              <div class="outputs-actions">
                <button class="btn-output-action" id="downloadAllBtn" title="Descargar todo">
                  <i class="ph ph-download-simple"></i>
                </button>
                <button class="btn-output-action" id="newGenerationBtn" title="Nueva generación">
                  <i class="ph ph-plus"></i>
                </button>
              </div>
            </div>
            <div class="outputs-grid" id="outputsGrid">
              <!-- Outputs dinámicos -->
            </div>
          </div>
        </main>

        <!-- Sidebar Derecho - Configuraciones -->
        <aside class="studio-sidebar" id="studioSidebar">
          <!-- Tab Bar para Móviles -->
          <div class="studio-tab-bar" id="studioTabBar">
            <button class="studio-tab active" data-tab="config">
              <i class="ph ph-gear"></i>
              <span>Config</span>
            </button>
            <button class="studio-tab" data-tab="creative">
              <i class="ph ph-palette"></i>
              <span>Creativo</span>
            </button>
            <button class="studio-tab" data-tab="advanced">
              <i class="ph ph-sliders-horizontal"></i>
              <span>Avanzado</span>
            </button>
          </div>

          <!-- Contenido del Sidebar -->
          <div class="sidebar-scroll">
            <!-- Sección: Marca y Producto -->
            <div class="sidebar-section" id="sectionConfig">
              <!-- Selector de Marca -->
              <div class="config-block">
                <label class="config-label">Marca</label>
                <div class="brand-card" id="brandCard" onclick="window.studioView?.openBrandSelector()">
                  <div class="brand-card-content">
                    <div class="brand-card-logo" id="brandLogo">
                      <i class="ph ph-storefront"></i>
                    </div>
                    <div class="brand-card-info">
                      <span class="brand-card-name" id="brandName">Seleccionar marca...</span>
                      <span class="brand-card-detail" id="brandDetail"></span>
                    </div>
                    <i class="ph ph-caret-right brand-card-arrow"></i>
                  </div>
                </div>
              </div>

              <!-- Selector de Producto -->
              <div class="config-block" id="productBlock" style="display: none;">
                <label class="config-label">Producto / Servicio</label>
                <select class="config-select" id="productSelector">
                  <option value="">Seleccionar producto...</option>
                </select>
              </div>

              <!-- Galería de Imágenes del Producto -->
              <div class="config-block" id="productImagesBlock" style="display: none;">
                <label class="config-label">Imágenes del producto</label>
                <div class="product-images-grid" id="productImagesGrid">
                  <!-- Imágenes dinámicas -->
                </div>
              </div>

              <!-- Selector de Tipo de Contenido (Flujo) -->
              <div class="config-block" id="flowBlock" style="display: none;">
                <label class="config-label">Tipo de contenido</label>
                <div class="flow-cards-container" id="flowCards">
                  <!-- Flujos dinámicos -->
                </div>
              </div>
            </div>

            <!-- Acordeones de Configuración -->
            <div class="accordions-wrapper" id="accordionsWrapper" style="display: none;">
              
              <!-- Acordeón: Guía Creativa (Info de marca y producto) -->
              <div class="accordion-section" id="accordionGuide">
                <div class="accordion-header" data-accordion="guide">
                  <h4><i class="ph ph-book-open"></i> Guía creativa</h4>
                  <i class="ph ph-caret-down accordion-icon"></i>
                </div>
                <div class="accordion-content" id="guideContent">
                  <div class="info-display" id="brandInfoDisplay">
                    <div class="info-grid">
                      <div class="info-item">
                        <span class="info-label">Tono de Voz</span>
                        <span class="info-value" id="infoBrandTone">-</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Personalidad</span>
                        <span class="info-value" id="infoBrandPersonality">-</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Palabras clave</span>
                        <span class="info-value" id="infoBrandKeywords">-</span>
                      </div>
                    </div>
                  </div>
                  <div class="info-display" id="productInfoDisplay" style="display: none;">
                    <div class="info-divider">
                      <span>Producto seleccionado</span>
                    </div>
                    <div class="info-grid">
                      <div class="info-item">
                        <span class="info-label">Categoría</span>
                        <span class="info-value" id="infoProductType">-</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Beneficios</span>
                        <span class="info-value" id="infoProductBenefits">-</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Diferenciadores</span>
                        <span class="info-value" id="infoProductDiff">-</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Acordeón: Inputs Dinámicos del Flujo -->
              <div class="accordion-section" id="accordionInputs">
                <div class="accordion-header" data-accordion="inputs">
                  <h4><i class="ph ph-textbox"></i> Configuración del contenido</h4>
                  <i class="ph ph-caret-down accordion-icon"></i>
                </div>
                <div class="accordion-content" id="inputsContent">
                  <div class="dynamic-inputs" id="dynamicInputs">
                    <!-- Inputs generados dinámicamente desde input_schema -->
                  </div>
                </div>
              </div>

              <!-- Acordeón: Contexto (Audiencia y Oferta) -->
              <div class="accordion-section" id="accordionContext">
                <div class="accordion-header" data-accordion="context">
                  <h4><i class="ph ph-users"></i> Contexto <span class="optional-tag">(opcional)</span></h4>
                  <i class="ph ph-caret-down accordion-icon"></i>
                </div>
                <div class="accordion-content" id="contextContent">
                  <div class="config-field">
                    <label>Audiencia objetivo</label>
                    <select class="config-select" id="audienceSelector">
                      <option value="">Seleccionar audiencia...</option>
                    </select>
                  </div>
                  <div class="audience-info" id="audienceInfo" style="display: none;">
                    <!-- Info de audiencia seleccionada -->
                  </div>
                </div>
              </div>

              <!-- Acordeón: Personalización Avanzada -->
              <div class="accordion-section" id="accordionAdvanced">
                <div class="accordion-header" data-accordion="advanced">
                  <h4><i class="ph ph-sliders"></i> Personalización avanzada <span class="optional-tag">(opcional)</span></h4>
                  <i class="ph ph-caret-down accordion-icon"></i>
                </div>
                <div class="accordion-content" id="advancedContent">
                  <div class="config-field">
                    <label>Creatividad (Temperatura)</label>
                    <div class="slider-field">
                      <input type="range" id="creativitySlider" min="0" max="100" value="70">
                      <span class="slider-value" id="creativityValue">0.7</span>
                    </div>
                    <span class="field-hint">Valores altos = más creatividad, más variación</span>
                  </div>
                  <div class="config-field">
                    <label>Prompt adicional <span class="optional-tag">(opcional)</span></label>
                    <textarea class="config-textarea" id="customPrompt" 
                              placeholder="Añade instrucciones específicas para personalizar el contenido..." 
                              rows="3"></textarea>
                  </div>
                  <div class="config-field">
                    <label>Negative prompt <span class="optional-tag">(opcional)</span></label>
                    <textarea class="config-textarea" id="negativePrompt" 
                              placeholder="Describe lo que NO quieres en el contenido..." 
                              rows="2"></textarea>
                  </div>
                </div>
              </div>
            </div>

            <!-- Botón de Generar (fijo en el sidebar) -->
            <div class="sidebar-footer" id="sidebarFooter" style="display: none;">
              <button class="btn-generate" id="generateBtn" disabled>
                <i class="ph ph-sparkle"></i>
                <span>Generar Contenido</span>
                <span class="btn-cost" id="generateCost">1 crédito</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      <!-- Modal: Selector de Marca -->
      <div class="modal studio-modal" id="brandSelectorModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-md">
          <div class="modal-header">
            <h3><i class="ph ph-storefront"></i> Seleccionar Marca</h3>
            <button class="modal-close" id="closeBrandModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="brands-grid" id="brandsGrid">
              <!-- Marcas dinámicas -->
            </div>
          </div>
        </div>
      </div>

      <!-- Modal: Preview de Output -->
      <div class="modal studio-modal" id="outputPreviewModal" style="display: none;">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3><i class="ph ph-eye"></i> Vista Previa</h3>
            <button class="modal-close" id="closePreviewModal">&times;</button>
          </div>
          <div class="modal-body" id="previewContent">
            <!-- Contenido del preview -->
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="copyOutputBtn">
              <i class="ph ph-copy"></i> Copiar
            </button>
            <button class="btn-primary" id="downloadOutputBtn">
              <i class="ph ph-download-simple"></i> Descargar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    // Guardar referencia global para acceso desde onclick
    window.studioView = this;
    
    await this.initSupabase();
    await this.loadCredits();
    await this.loadBrands();
    await this.loadFlows();
    this.setupEventListeners();
    this.setupAccordions();
  }

  async initSupabase() {
    if (window.supabase) {
      this.supabase = window.supabase;
    } else if (window.authService?.supabase) {
      this.supabase = window.authService.supabase;
    }
    
    const user = window.authService?.getCurrentUser();
    this.userId = user?.id;
    
    // Cargar organization_id del usuario
    if (this.supabase && this.userId) {
      const { data } = await this.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', this.userId)
        .limit(1)
        .single();
      
      if (data) {
        this.organizationId = data.organization_id;
      }
    }
  }

  async loadCredits() {
    if (!this.supabase) return;
    
    try {
      if (this.organizationId) {
        const { data } = await this.supabase
          .from('organization_credits')
          .select('credits_available, credits_total')
          .eq('organization_id', this.organizationId)
          .single();
        
        if (data) {
          this.credits = { available: data.credits_available, total: data.credits_total };
        }
      } else if (this.userId) {
        const { data } = await this.supabase
          .from('users')
          .select('credits_available, credits_total')
          .eq('id', this.userId)
          .single();
        
        if (data) {
          this.credits = { available: data.credits_available, total: data.credits_total };
        }
      }
      
      this.updateCreditsDisplay();
    } catch (err) {
      console.error('Error loading credits:', err);
    }
  }

  updateCreditsDisplay() {
    const creditsEl = this.querySelector('#creditsValue');
    if (creditsEl) {
      creditsEl.textContent = this.credits.available;
    }
  }

  async loadBrands() {
    if (!this.supabase || !this.userId) return;
    
    try {
      let query = this.supabase
        .from('brand_containers')
        .select(`
          id,
          nombre_marca,
          logo_url,
          sitio_web,
          brands (
            id,
            tono_voz,
            palabras_usar,
            personalidad_marca,
            quienes_somos
          )
        `)
        .eq('user_id', this.userId);
      
      if (this.organizationId) {
        query = this.supabase
          .from('brand_containers')
          .select(`
            id,
            nombre_marca,
            logo_url,
            sitio_web,
            brands (
              id,
              tono_voz,
              palabras_usar,
              personalidad_marca,
              quienes_somos
            )
          `)
          .eq('organization_id', this.organizationId);
      }
      
      const { data, error } = await query.order('nombre_marca', { ascending: true });
      
      if (error) throw error;
      
      this.brands = data || [];
      
      // Si solo hay una marca, seleccionarla automáticamente
      if (this.brands.length === 1) {
        this.selectBrand(this.brands[0]);
      }
    } catch (err) {
      console.error('Error loading brands:', err);
    }
  }

  async loadFlows() {
    if (!this.supabase) return;
    
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select(`
          id,
          name,
          description,
          output_type,
          flow_image_url,
          token_cost,
          input_schema,
          ui_layout_config,
          flow_category_type,
          webhook_url,
          category_id,
          content_categories (
            id,
            name
          )
        `)
        .eq('status', 'published')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      this.flows = data || [];
    } catch (err) {
      console.error('Error loading flows:', err);
    }
  }

  // === BRAND MANAGEMENT ===
  
  openBrandSelector() {
    const modal = this.querySelector('#brandSelectorModal');
    const grid = this.querySelector('#brandsGrid');
    
    if (!modal || !grid) return;
    
    // Renderizar marcas
    if (this.brands.length === 0) {
      grid.innerHTML = `
        <div class="brands-empty">
          <i class="ph ph-storefront"></i>
          <p>No tienes marcas creadas</p>
          <a href="/brands" class="btn-link">Crear marca</a>
        </div>
      `;
    } else {
      grid.innerHTML = this.brands.map(brand => `
        <div class="brand-option ${this.selectedBrand?.id === brand.id ? 'selected' : ''}" 
             data-brand-id="${brand.id}">
          <div class="brand-option-logo">
            ${brand.logo_url 
              ? `<img src="${brand.logo_url}" alt="${brand.nombre_marca}">`
              : `<span>${brand.nombre_marca.charAt(0).toUpperCase()}</span>`
            }
          </div>
          <div class="brand-option-info">
            <span class="brand-option-name">${brand.nombre_marca}</span>
            ${brand.sitio_web ? `<span class="brand-option-url">${brand.sitio_web}</span>` : ''}
          </div>
          ${this.selectedBrand?.id === brand.id ? '<i class="ph ph-check-circle"></i>' : ''}
        </div>
      `).join('');
      
      // Event listeners
      grid.querySelectorAll('.brand-option').forEach(option => {
        option.addEventListener('click', () => {
          const brandId = option.dataset.brandId;
          const brand = this.brands.find(b => b.id === brandId);
          if (brand) {
            this.selectBrand(brand);
            modal.style.display = 'none';
          }
        });
      });
    }
    
    modal.style.display = 'flex';
  }

  selectBrand(brand) {
    this.selectedBrand = brand;
    
    // Actualizar UI del brand card
    const logoEl = this.querySelector('#brandLogo');
    const nameEl = this.querySelector('#brandName');
    const detailEl = this.querySelector('#brandDetail');
    
    if (logoEl) {
      if (brand.logo_url) {
        logoEl.innerHTML = `<img src="${brand.logo_url}" alt="${brand.nombre_marca}">`;
      } else {
        logoEl.innerHTML = `<span>${brand.nombre_marca.charAt(0).toUpperCase()}</span>`;
      }
      logoEl.classList.add('has-logo');
    }
    
    if (nameEl) nameEl.textContent = brand.nombre_marca;
    if (detailEl) detailEl.textContent = brand.sitio_web || '';
    
    // Mostrar bloque de productos
    const productBlock = this.querySelector('#productBlock');
    if (productBlock) productBlock.style.display = 'block';
    
    // Cargar productos de la marca
    this.loadProducts(brand.id);
    
    // Actualizar info de marca
    this.updateBrandInfo(brand);
    
    // Mostrar selector de flujos
    const flowBlock = this.querySelector('#flowBlock');
    if (flowBlock) flowBlock.style.display = 'block';
    this.renderFlowCards();
    
    // Actualizar header context
    const headerContext = this.querySelector('#headerContext');
    if (headerContext) headerContext.textContent = brand.nombre_marca;
  }

  updateBrandInfo(brand) {
    const brandData = brand.brands?.[0] || brand.brands;
    
    if (!brandData) return;
    
    const toneEl = this.querySelector('#infoBrandTone');
    const personalityEl = this.querySelector('#infoBrandPersonality');
    const keywordsEl = this.querySelector('#infoBrandKeywords');
    
    if (toneEl) toneEl.textContent = brandData.tono_voz || '-';
    if (personalityEl) personalityEl.textContent = brandData.personalidad_marca || '-';
    if (keywordsEl) keywordsEl.textContent = brandData.palabras_usar || '-';
  }

  async loadProducts(brandId) {
    if (!this.supabase) return;
    
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('id, nombre_producto, tipo_producto, descripcion_producto, beneficio_1, beneficio_2, beneficio_3, diferenciacion')
        .eq('brand_container_id', brandId)
        .order('nombre_producto', { ascending: true });
      
      if (error) throw error;
      
      this.products = data || [];
      this.renderProductSelector();
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  renderProductSelector() {
    const selector = this.querySelector('#productSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">Seleccionar producto (opcional)...</option>';
    
    this.products.forEach(product => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = product.nombre_producto;
      selector.appendChild(option);
    });
  }

  async selectProduct(productId) {
    if (!productId) {
      this.selectedProduct = null;
      this.querySelector('#productImagesBlock').style.display = 'none';
      this.querySelector('#productInfoDisplay').style.display = 'none';
      return;
    }
    
    this.selectedProduct = this.products.find(p => p.id === productId);
    
    if (!this.selectedProduct) return;
    
    // Mostrar info del producto
    this.updateProductInfo(this.selectedProduct);
    
    // Cargar imágenes
    await this.loadProductImages(productId);
  }

  updateProductInfo(product) {
    const infoDisplay = this.querySelector('#productInfoDisplay');
    if (infoDisplay) infoDisplay.style.display = 'block';
    
    const typeEl = this.querySelector('#infoProductType');
    const benefitsEl = this.querySelector('#infoProductBenefits');
    const diffEl = this.querySelector('#infoProductDiff');
    
    if (typeEl) typeEl.textContent = product.tipo_producto || '-';
    
    const benefits = [product.beneficio_1, product.beneficio_2, product.beneficio_3]
      .filter(Boolean)
      .join(', ');
    if (benefitsEl) benefitsEl.textContent = benefits || '-';
    
    if (diffEl) diffEl.textContent = product.diferenciacion || '-';
  }

  async loadProductImages(productId) {
    if (!this.supabase) return;
    
    try {
      const { data, error } = await this.supabase
        .from('product_images')
        .select('id, image_url, image_type')
        .eq('product_id', productId)
        .order('image_order', { ascending: true });
      
      if (error) throw error;
      
      this.productImages = data || [];
      this.renderProductImages();
    } catch (err) {
      console.error('Error loading product images:', err);
    }
  }

  renderProductImages() {
    const block = this.querySelector('#productImagesBlock');
    const grid = this.querySelector('#productImagesGrid');
    
    if (!grid) return;
    
    if (this.productImages.length === 0) {
      if (block) block.style.display = 'none';
      return;
    }
    
    if (block) block.style.display = 'block';
    
    grid.innerHTML = this.productImages.map(img => `
      <div class="product-image-thumb" data-image-id="${img.id}">
        <img src="${img.image_url}" alt="">
        <div class="image-type-badge">${img.image_type || 'Imagen'}</div>
      </div>
    `).join('');
  }

  // === FLOW MANAGEMENT ===
  
  renderFlowCards() {
    const container = this.querySelector('#flowCards');
    if (!container) return;
    
    if (this.flows.length === 0) {
      container.innerHTML = `
        <div class="flows-empty">
          <i class="ph ph-warning"></i>
          <p>No hay flujos disponibles</p>
        </div>
      `;
      return;
    }
    
    // Agrupar por categoría
    const grouped = {};
    this.flows.forEach(flow => {
      const category = flow.content_categories?.name || 'General';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(flow);
    });
    
    let html = '';
    
    Object.entries(grouped).forEach(([category, flows]) => {
      html += `
        <div class="flow-category">
          <span class="flow-category-label">${category}</span>
          <div class="flow-cards-row">
            ${flows.map(flow => this.renderFlowCard(flow)).join('')}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // Event listeners
    container.querySelectorAll('.flow-card').forEach(card => {
      card.addEventListener('click', () => {
        const flowId = card.dataset.flowId;
        const flow = this.flows.find(f => f.id === flowId);
        if (flow) this.selectFlow(flow);
      });
    });
  }

  renderFlowCard(flow) {
    const isSelected = this.selectedFlow?.id === flow.id;
    
    return `
      <div class="flow-card ${isSelected ? 'selected' : ''}" data-flow-id="${flow.id}">
        <div class="flow-card-image">
          ${flow.flow_image_url 
            ? `<img src="${flow.flow_image_url}" alt="${flow.name}">`
            : `<div class="flow-card-icon"><i class="ph ph-magic-wand"></i></div>`
          }
        </div>
        <div class="flow-card-body">
          <h5>${flow.name}</h5>
          <p>${flow.description || 'Generar contenido con IA'}</p>
          <div class="flow-card-footer">
            <span class="flow-type">${flow.output_type || 'text'}</span>
            <span class="flow-cost">
              <i class="ph ph-coins"></i>
              ${flow.token_cost || 1}
            </span>
          </div>
        </div>
        ${isSelected ? '<div class="flow-selected-badge"><i class="ph ph-check"></i></div>' : ''}
      </div>
    `;
  }

  selectFlow(flow) {
    this.selectedFlow = flow;
    
    // Actualizar visual de cards
    this.querySelectorAll('.flow-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.flowId === flow.id);
      const badge = card.querySelector('.flow-selected-badge');
      if (card.dataset.flowId === flow.id && !badge) {
        card.insertAdjacentHTML('beforeend', '<div class="flow-selected-badge"><i class="ph ph-check"></i></div>');
      } else if (card.dataset.flowId !== flow.id && badge) {
        badge.remove();
      }
    });
    
    // Mostrar acordeones y footer
    const accordionsWrapper = this.querySelector('#accordionsWrapper');
    const sidebarFooter = this.querySelector('#sidebarFooter');
    
    if (accordionsWrapper) accordionsWrapper.style.display = 'block';
    if (sidebarFooter) sidebarFooter.style.display = 'block';
    
    // Actualizar costo en botón
    const costEl = this.querySelector('#generateCost');
    if (costEl) costEl.textContent = `${flow.token_cost || 1} crédito${flow.token_cost > 1 ? 's' : ''}`;
    
    // Renderizar inputs dinámicos
    this.renderDynamicInputs(flow);
    
    // Habilitar botón de generar
    this.updateGenerateButton();
    
    // Abrir acordeón de inputs
    this.openAccordion('inputs');
  }

  renderDynamicInputs(flow) {
    const container = this.querySelector('#dynamicInputs');
    if (!container) return;
    
    const fields = flow.input_schema?.fields || [];
    
    if (fields.length === 0) {
      container.innerHTML = `
        <div class="inputs-empty">
          <p>Este flujo no requiere configuración adicional</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = fields.map(field => this.renderInputField(field)).join('');
    
    // Setup listeners para inputs
    this.setupDynamicInputListeners();
  }

  renderInputField(field) {
    const required = field.required ? '<span class="required">*</span>' : '';
    const hint = field.description ? `<span class="field-hint">${field.description}</span>` : '';
    
    let inputHtml = '';
    
    switch (field.input_type) {
      case 'text':
        inputHtml = `
          <input type="text" 
                 class="config-input" 
                 id="input_${field.key}" 
                 name="${field.key}"
                 placeholder="${field.placeholder || ''}"
                 ${field.required ? 'required' : ''}>
        `;
        break;
      
      case 'textarea':
        inputHtml = `
          <textarea class="config-textarea" 
                    id="input_${field.key}" 
                    name="${field.key}"
                    rows="${field.rows || 3}"
                    placeholder="${field.placeholder || ''}"
                    ${field.required ? 'required' : ''}></textarea>
        `;
        break;
      
      case 'select':
        const options = (field.options || []).map(opt => 
          `<option value="${opt.value || opt}">${opt.label || opt}</option>`
        ).join('');
        inputHtml = `
          <select class="config-select" 
                  id="input_${field.key}" 
                  name="${field.key}"
                  ${field.required ? 'required' : ''}>
            <option value="">${field.placeholder || 'Seleccionar...'}</option>
            ${options}
          </select>
        `;
        break;
      
      case 'number':
        inputHtml = `
          <input type="number" 
                 class="config-input" 
                 id="input_${field.key}" 
                 name="${field.key}"
                 min="${field.min ?? ''}"
                 max="${field.max ?? ''}"
                 step="${field.step || 1}"
                 value="${field.defaultValue ?? ''}"
                 ${field.required ? 'required' : ''}>
        `;
        break;
      
      case 'range':
        inputHtml = `
          <div class="slider-field">
            <input type="range" 
                   id="input_${field.key}" 
                   name="${field.key}"
                   min="${field.min || 0}"
                   max="${field.max || 100}"
                   step="${field.step || 1}"
                   value="${field.defaultValue || 50}">
            <span class="slider-value">${field.defaultValue || 50}</span>
          </div>
        `;
        break;
      
      case 'checkbox':
        inputHtml = `
          <label class="checkbox-field">
            <input type="checkbox" 
                   id="input_${field.key}" 
                   name="${field.key}"
                   ${field.defaultValue ? 'checked' : ''}>
            <span>${field.label}</span>
          </label>
        `;
        return `<div class="config-field checkbox-wrapper">${inputHtml}${hint}</div>`;
      
      case 'radio':
        const radioOptions = (field.options || []).map((opt, i) => `
          <label class="radio-option">
            <input type="radio" 
                   name="${field.key}" 
                   value="${opt.value || opt}"
                   ${i === 0 ? 'checked' : ''}>
            <span>${opt.label || opt}</span>
          </label>
        `).join('');
        inputHtml = `<div class="radio-group">${radioOptions}</div>`;
        break;
      
      case 'chips':
        const chips = (field.options || []).map(opt => `
          <button type="button" 
                  class="chip-btn" 
                  data-field="${field.key}"
                  data-value="${opt.value || opt}">
            ${opt.label || opt}
          </button>
        `).join('');
        inputHtml = `<div class="chips-selector" id="chips_${field.key}">${chips}</div>`;
        break;
      
      default:
        inputHtml = `
          <input type="text" 
                 class="config-input" 
                 id="input_${field.key}" 
                 name="${field.key}"
                 placeholder="${field.placeholder || ''}"
                 ${field.required ? 'required' : ''}>
        `;
    }
    
    return `
      <div class="config-field" data-key="${field.key}">
        <label for="input_${field.key}">${field.label || field.key} ${required}</label>
        ${inputHtml}
        ${hint}
      </div>
    `;
  }

  setupDynamicInputListeners() {
    // Range sliders
    this.querySelectorAll('.slider-field input[type="range"]').forEach(slider => {
      const valueDisplay = slider.parentElement.querySelector('.slider-value');
      slider.addEventListener('input', () => {
        if (valueDisplay) valueDisplay.textContent = slider.value;
      });
    });
    
    // Chips
    this.querySelectorAll('.chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const isMultiple = chip.closest('.chips-selector')?.dataset.multiple === 'true';
        
        if (isMultiple) {
          chip.classList.toggle('active');
        } else {
          chip.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });
    });
    
    // Update generate button on change
    this.querySelectorAll('#dynamicInputs input, #dynamicInputs textarea, #dynamicInputs select').forEach(el => {
      el.addEventListener('change', () => this.updateGenerateButton());
      el.addEventListener('input', () => this.updateGenerateButton());
    });
  }

  collectFormData() {
    const data = {};
    const fields = this.selectedFlow?.input_schema?.fields || [];
    
    fields.forEach(field => {
      const el = this.querySelector(`[name="${field.key}"]`);
      if (!el) return;
      
      if (el.type === 'checkbox') {
        data[field.key] = el.checked;
      } else if (el.type === 'radio') {
        const checked = this.querySelector(`[name="${field.key}"]:checked`);
        data[field.key] = checked?.value || null;
      } else if (el.type === 'range') {
        data[field.key] = parseFloat(el.value);
      } else {
        data[field.key] = el.value;
      }
    });
    
    // Collect chips
    this.querySelectorAll('.chips-selector').forEach(container => {
      const fieldKey = container.id.replace('chips_', '');
      const activeChips = container.querySelectorAll('.chip-btn.active');
      const values = Array.from(activeChips).map(c => c.dataset.value);
      data[fieldKey] = values.length === 1 ? values[0] : values;
    });
    
    // Add advanced options
    const creativitySlider = this.querySelector('#creativitySlider');
    if (creativitySlider) {
      data._creativity = parseFloat(creativitySlider.value) / 100;
    }
    
    const customPrompt = this.querySelector('#customPrompt');
    if (customPrompt?.value) {
      data._custom_prompt = customPrompt.value;
    }
    
    const negativePrompt = this.querySelector('#negativePrompt');
    if (negativePrompt?.value) {
      data._negative_prompt = negativePrompt.value;
    }
    
    return data;
  }

  updateGenerateButton() {
    const btn = this.querySelector('#generateBtn');
    if (!btn) return;
    
    const canGenerate = this.selectedBrand && this.selectedFlow && this.credits.available >= (this.selectedFlow.token_cost || 1);
    btn.disabled = !canGenerate;
  }

  // === GENERATION ===
  
  async generate() {
    if (!this.selectedFlow || !this.selectedBrand || this.isGenerating) return;
    
    const cost = this.selectedFlow.token_cost || 1;
    
    if (this.credits.available < cost) {
      this.showNotification('No tienes suficientes créditos', 'error');
      return;
    }
    
    this.isGenerating = true;
    this.showGeneratingState();
    
    const formData = this.collectFormData();
    
    // Construir payload
    const payload = {
      inputs: formData,
      brand: {
        id: this.selectedBrand.id,
        name: this.selectedBrand.nombre_marca,
        brand_data: this.selectedBrand.brands?.[0] || {}
      },
      product: this.selectedProduct ? {
        id: this.selectedProduct.id,
        name: this.selectedProduct.nombre_producto,
        type: this.selectedProduct.tipo_producto
      } : null,
      flow_id: this.selectedFlow.id,
      user_id: this.userId,
      organization_id: this.organizationId,
      timestamp: new Date().toISOString()
    };
    
    // Obtener webhook URL
    let webhookUrl = this.selectedFlow.webhook_url;
    
    // Intentar obtener de flow_technical_details
    if (this.supabase) {
      const { data: tech } = await this.supabase
        .from('flow_technical_details')
        .select('webhook_url_prod, webhook_url_test')
        .eq('flow_id', this.selectedFlow.id)
        .single();
      
      if (tech) {
        webhookUrl = tech.webhook_url_prod || tech.webhook_url_test || webhookUrl;
      }
    }
    
    if (!webhookUrl) {
      this.showNotification('Este flujo no está configurado correctamente', 'error');
      this.isGenerating = false;
      this.hideGeneratingState();
      return;
    }
    
    try {
      // Crear registro de ejecución
      let runId = null;
      if (this.supabase) {
        const { data: run } = await this.supabase
          .from('flow_runs')
          .insert({
            flow_id: this.selectedFlow.id,
            brand_id: this.selectedBrand.brands?.[0]?.id,
            user_id: this.userId,
            status: 'running',
            inputs_used: formData,
            entity_id: this.selectedProduct?.id
          })
          .select('id')
          .single();
        
        if (run) runId = run.id;
      }
      
      this.updateGeneratingStatus('Enviando solicitud al servidor...');
      
      // Llamar al webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, run_id: runId })
      });
      
      this.updateGeneratingStatus('Procesando respuesta...');
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      // Descontar créditos
      await this.deductCredits(cost);
      
      // Actualizar registro de ejecución
      if (this.supabase && runId) {
        await this.supabase
          .from('flow_runs')
          .update({
            status: 'completed',
            webhook_response_code: response.status,
            tokens_consumed: cost
          })
          .eq('id', runId);
      }
      
      // Mostrar resultados
      this.showOutputs(responseData);
      
    } catch (err) {
      console.error('Generation error:', err);
      this.showNotification('Error al generar contenido: ' + err.message, 'error');
      this.hideGeneratingState();
    } finally {
      this.isGenerating = false;
    }
  }

  async deductCredits(amount) {
    if (!this.supabase) return;
    
    try {
      if (this.organizationId) {
        await this.supabase.rpc('deduct_organization_credits', {
          org_id: this.organizationId,
          amount
        });
      } else {
        await this.supabase
          .from('users')
          .update({ credits_available: this.credits.available - amount })
          .eq('id', this.userId);
      }
      
      this.credits.available -= amount;
      this.updateCreditsDisplay();
    } catch (err) {
      console.error('Error deducting credits:', err);
    }
  }

  showGeneratingState() {
    const welcome = this.querySelector('#canvasWelcome');
    const generating = this.querySelector('#canvasGenerating');
    const outputs = this.querySelector('#canvasOutputs');
    
    if (welcome) welcome.style.display = 'none';
    if (outputs) outputs.style.display = 'none';
    if (generating) generating.style.display = 'flex';
    
    // Animar progress bar
    const progress = this.querySelector('#generatingProgress');
    if (progress) {
      progress.style.width = '0%';
      let width = 0;
      const interval = setInterval(() => {
        if (!this.isGenerating || width >= 90) {
          clearInterval(interval);
          return;
        }
        width += Math.random() * 15;
        progress.style.width = `${Math.min(width, 90)}%`;
      }, 300);
    }
  }

  updateGeneratingStatus(text) {
    const statusEl = this.querySelector('#generatingStatus');
    if (statusEl) statusEl.textContent = text;
  }

  hideGeneratingState() {
    const generating = this.querySelector('#canvasGenerating');
    const welcome = this.querySelector('#canvasWelcome');
    
    if (generating) generating.style.display = 'none';
    if (welcome) welcome.style.display = 'flex';
  }

  showOutputs(data) {
    const generating = this.querySelector('#canvasGenerating');
    const outputs = this.querySelector('#canvasOutputs');
    const grid = this.querySelector('#outputsGrid');
    
    // Complete progress
    const progress = this.querySelector('#generatingProgress');
    if (progress) progress.style.width = '100%';
    
    setTimeout(() => {
      if (generating) generating.style.display = 'none';
      if (outputs) outputs.style.display = 'block';
      
      // Render outputs
      this.generatedOutputs = Array.isArray(data) ? data : [data];
      
      if (grid) {
        grid.innerHTML = this.generatedOutputs.map((output, index) => this.renderOutput(output, index)).join('');
        
        // Setup output listeners
        this.setupOutputListeners();
      }
      
      this.showNotification('¡Contenido generado exitosamente!', 'success');
    }, 500);
  }

  renderOutput(output, index) {
    const isText = typeof output === 'string' || output.type === 'text' || output.content;
    const isImage = output.type === 'image' || output.image_url;
    
    if (isImage) {
      return `
        <div class="output-card image" data-index="${index}">
          <div class="output-image">
            <img src="${output.image_url || output.url}" alt="Generated image">
          </div>
          <div class="output-actions">
            <button class="output-action-btn preview-btn" title="Vista previa">
              <i class="ph ph-eye"></i>
            </button>
            <button class="output-action-btn download-btn" title="Descargar">
              <i class="ph ph-download-simple"></i>
            </button>
          </div>
        </div>
      `;
    }
    
    const content = typeof output === 'string' ? output : (output.content || output.text || JSON.stringify(output, null, 2));
    const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;
    
    return `
      <div class="output-card text" data-index="${index}">
        <div class="output-text">
          <pre>${truncated}</pre>
        </div>
        <div class="output-actions">
          <button class="output-action-btn preview-btn" title="Ver completo">
            <i class="ph ph-eye"></i>
          </button>
          <button class="output-action-btn copy-btn" title="Copiar">
            <i class="ph ph-copy"></i>
          </button>
        </div>
      </div>
    `;
  }

  setupOutputListeners() {
    // Preview buttons
    this.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.closest('.output-card').dataset.index);
        this.showOutputPreview(this.generatedOutputs[index]);
      });
    });
    
    // Copy buttons
    this.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.closest('.output-card').dataset.index);
        const output = this.generatedOutputs[index];
        const content = typeof output === 'string' ? output : (output.content || output.text || JSON.stringify(output));
        navigator.clipboard.writeText(content).then(() => {
          this.showNotification('Contenido copiado', 'success');
        });
      });
    });
    
    // Download buttons
    this.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.closest('.output-card').dataset.index);
        this.downloadOutput(this.generatedOutputs[index]);
      });
    });
    
    // New generation button
    const newBtn = this.querySelector('#newGenerationBtn');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        this.querySelector('#canvasOutputs').style.display = 'none';
        this.querySelector('#canvasWelcome').style.display = 'flex';
        this.generatedOutputs = [];
      });
    }
  }

  showOutputPreview(output) {
    const modal = this.querySelector('#outputPreviewModal');
    const content = this.querySelector('#previewContent');
    
    if (!modal || !content) return;
    
    const isImage = output.type === 'image' || output.image_url;
    
    if (isImage) {
      content.innerHTML = `
        <div class="preview-image">
          <img src="${output.image_url || output.url}" alt="Preview">
        </div>
      `;
    } else {
      const text = typeof output === 'string' ? output : (output.content || output.text || JSON.stringify(output, null, 2));
      content.innerHTML = `<pre class="preview-text">${text}</pre>`;
    }
    
    modal.style.display = 'flex';
  }

  downloadOutput(output) {
    const isImage = output.type === 'image' || output.image_url;
    
    if (isImage) {
      const link = document.createElement('a');
      link.href = output.image_url || output.url;
      link.download = `generated_${Date.now()}.png`;
      link.click();
    } else {
      const content = typeof output === 'string' ? output : (output.content || output.text || JSON.stringify(output, null, 2));
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `generated_${Date.now()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  // === ACCORDIONS ===
  
  setupAccordions() {
    this.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const accordionId = header.dataset.accordion;
        this.toggleAccordion(accordionId);
      });
    });
  }

  toggleAccordion(id) {
    const content = this.querySelector(`#${id}Content`);
    const header = this.querySelector(`[data-accordion="${id}"]`);
    const icon = header?.querySelector('.accordion-icon');
    
    if (!content) return;
    
    const isOpen = this.openAccordions.has(id);
    
    if (isOpen) {
      content.classList.remove('open');
      header?.classList.remove('active');
      icon?.classList.remove('rotated');
      this.openAccordions.delete(id);
    } else {
      content.classList.add('open');
      header?.classList.add('active');
      icon?.classList.add('rotated');
      this.openAccordions.add(id);
    }
  }

  openAccordion(id) {
    if (!this.openAccordions.has(id)) {
      this.toggleAccordion(id);
    }
  }

  // === EVENT LISTENERS ===
  
  setupEventListeners() {
    // Product selector
    const productSelector = this.querySelector('#productSelector');
    if (productSelector) {
      productSelector.addEventListener('change', (e) => this.selectProduct(e.target.value));
    }
    
    // Generate button
    const generateBtn = this.querySelector('#generateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generate());
    }
    
    // Creativity slider
    const creativitySlider = this.querySelector('#creativitySlider');
    const creativityValue = this.querySelector('#creativityValue');
    if (creativitySlider && creativityValue) {
      creativitySlider.addEventListener('input', () => {
        creativityValue.textContent = (parseFloat(creativitySlider.value) / 100).toFixed(2);
      });
    }
    
    // Tab bar (mobile)
    this.querySelectorAll('.studio-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Scroll to section
        const sectionId = tab.dataset.tab;
        // TODO: Implement tab scrolling
      });
    });
    
    // Modal close buttons
    const closeBrandModal = this.querySelector('#closeBrandModal');
    const brandModal = this.querySelector('#brandSelectorModal');
    if (closeBrandModal && brandModal) {
      closeBrandModal.addEventListener('click', () => brandModal.style.display = 'none');
      brandModal.querySelector('.modal-overlay')?.addEventListener('click', () => brandModal.style.display = 'none');
    }
    
    const closePreviewModal = this.querySelector('#closePreviewModal');
    const previewModal = this.querySelector('#outputPreviewModal');
    if (closePreviewModal && previewModal) {
      closePreviewModal.addEventListener('click', () => previewModal.style.display = 'none');
      previewModal.querySelector('.modal-overlay')?.addEventListener('click', () => previewModal.style.display = 'none');
    }
    
    // Copy and download in preview modal
    const copyOutputBtn = this.querySelector('#copyOutputBtn');
    if (copyOutputBtn) {
      copyOutputBtn.addEventListener('click', () => {
        const text = this.querySelector('.preview-text')?.textContent;
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Contenido copiado', 'success');
          });
        }
      });
    }
  }

  showNotification(message, type = 'info') {
    const existing = document.querySelector('.studio-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `studio-notification ${type}`;
    notification.innerHTML = `
      <i class="ph ph-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

window.StudioView = StudioView;
