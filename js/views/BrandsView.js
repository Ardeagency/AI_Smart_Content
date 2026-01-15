/**
 * BrandsView - Vista de marcas (Dashboard Premium)
 * Renders simplificados y robustos
 */
class BrandsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'brands.html';
    this.supabase = null;
    this.userId = null;
    this.brandContainerData = null;
    this.brandData = null;
    this.products = [];
    this.brandColors = [];
    this.brandRules = [];
    this.brandAssets = [];
    this.organizationMembers = [];
    this.organizationCredits = { credits_available: 100 };
    this.creditUsage = [];
    this.isActive = false;
  }

  async onEnter() {
    this.isActive = true;
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
          window.router.navigate('/login', true);
        return;
      }
    }
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }
  }

  onLeave() {
    this.isActive = false;
  }

  async render() {
    // Limpiar caché del template si existe (para forzar recarga)
    if (window.router && window.router.templateCache && this.templatePath) {
      window.router.templateCache.delete(this.templatePath);
      console.log('🧹 Caché del template limpiado para:', this.templatePath);
    }
    
    await super.render();
    // Asegurar que renderAll se ejecute después de que el template esté completamente en el DOM
    if (this.isActive) {
      // Función para verificar y renderizar
      const tryRender = (attempt = 0) => {
        // Buscar dentro del container específico, no en todo el document
        const container = this.container || document.getElementById('app-container');
        if (!container) {
          console.error('❌ Container no encontrado');
          return;
        }
        
        // Verificar que los contenedores críticos existan dentro del container
        const brandColorsEl = container.querySelector('#brandColorSwatches') || document.getElementById('brandColorSwatches');
        const typographyEl = container.querySelector('#typographyPreview') || document.getElementById('typographyPreview');
        const statusEl = container.querySelector('#visualStatus') || document.getElementById('visualStatus');
        
        const hasContainers = brandColorsEl && typographyEl && statusEl;
        
        if (hasContainers) {
          // Si los contenedores existen, renderizar
          console.log('✅ Contenedores encontrados, renderizando Visual de marca...');
          this.renderAll();
        } else if (attempt >= 10) {
          // Si hemos intentado 10 veces, renderizar de todas formas (puede haber un problema)
          console.warn('⚠️ Contenedores no encontrados después de 10 intentos. Renderizando de todas formas...');
          console.log('brandColorSwatches:', brandColorsEl ? '✓' : '✗');
          console.log('typographyPreview:', typographyEl ? '✓' : '✗');
          console.log('visualStatus:', statusEl ? '✓' : '✗');
          if (container) {
            const htmlPreview = container.innerHTML;
            console.log('Container HTML length:', htmlPreview.length);
            console.log('Container HTML preview (first 2000 chars):', htmlPreview.substring(0, 2000));
            // Buscar si existe la card-concept en el HTML
            const hasCardConcept = htmlPreview.includes('card-concept');
            const hasBrandColorSwatches = htmlPreview.includes('brandColorSwatches');
            console.log('¿Tiene card-concept?', hasCardConcept);
            console.log('¿Tiene brandColorSwatches?', hasBrandColorSwatches);
          }
          this.renderAll();
    } else {
          // Si no existen, esperar un poco más y reintentar
          setTimeout(() => tryRender(attempt + 1), 100);
        }
      };
      
      // Usar requestAnimationFrame para asegurar que el DOM esté listo
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tryRender();
        });
      });
    }
  }

  async init() {
    await this.initSupabase();
    await this.loadData();
    // No llamar renderAll aquí, se llamará desde render() después del DOM
  }

  async updateHeader() {
    await super.updateHeader();
    const name = this.brandContainerData?.nombre_marca || 'Marcas';
    this.updateHeaderContext('Marcas', name);
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
    } catch (error) {
      console.error('Error Supabase:', error);
    }
  }

  async loadData() {
    if (!this.supabase || !this.userId) return;

    try {
      // Brand container
      const { data: container, error: containerError } = await this.supabase
        .from('brand_containers')
        .select('*')
        .eq('user_id', this.userId)
        .limit(1)
        .maybeSingle();
      
      if (containerError) {
        console.warn('⚠️ Error cargando brand container:', containerError);
        return;
      }
      
      if (container) {
        this.brandContainerData = container;
        
        // Brand
        const { data: brand, error: brandError } = await this.supabase
        .from('brands')
        .select('*')
          .eq('project_id', container.id)
          .maybeSingle();
        
        if (brandError) {
          console.warn('⚠️ Error cargando brand:', brandError);
        } else {
          this.brandData = brand || null;
        }

        // Productos
        const { data: products, error: productsError } = await this.supabase
          .from('products')
          .select('*')
          .eq('brand_container_id', container.id)
          .limit(5);
        
        if (productsError) {
          console.warn('⚠️ Error cargando productos:', productsError);
          this.products = [];
        } else {
          this.products = products || [];
        }

        // Brand Assets (archivos de identidad)
        const { data: assets, error: assetsError } = await this.supabase
        .from('brand_assets')
        .select('*')
          .eq('brand_container_id', container.id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (assetsError) {
          console.warn('⚠️ Error cargando brand assets:', assetsError);
          this.brandAssets = [];
        } else {
          this.brandAssets = assets || [];
        }

        // Colores y reglas
        if (this.brandData?.id) {
          const [colorsResult, rulesResult] = await Promise.allSettled([
            this.supabase.from('brand_colors').select('*').eq('brand_id', this.brandData.id),
            this.supabase.from('brand_rules').select('*').eq('brand_id', this.brandData.id)
          ]);
          
          if (colorsResult.status === 'fulfilled' && !colorsResult.value.error) {
            this.brandColors = colorsResult.value.data || [];
          } else {
            console.warn('⚠️ Error cargando colores:', colorsResult.reason || colorsResult.value?.error);
            this.brandColors = [];
          }
          
          if (rulesResult.status === 'fulfilled' && !rulesResult.value.error) {
            this.brandRules = rulesResult.value.data || [];
          } else {
            console.warn('⚠️ Error cargando reglas:', rulesResult.reason || rulesResult.value?.error);
            this.brandRules = [];
          }
        }

        // Organización
        if (container.organization_id) {
          try {
            const [membersResult, creditsResult, usageResult] = await Promise.allSettled([
              this.supabase
                .from('organization_members')
                .select('*, users(id, full_name, email)')
                .eq('organization_id', container.organization_id)
                .limit(5),
              this.supabase
                .from('organization_credits')
                .select('*')
                .eq('organization_id', container.organization_id)
                .maybeSingle(),
              this.supabase
                .from('credit_usage')
                .select('*')
                .eq('organization_id', container.organization_id)
                .limit(10)
            ]);
            
            // Members
            if (membersResult.status === 'fulfilled' && !membersResult.value.error) {
              this.organizationMembers = membersResult.value.data || [];
            } else {
              const error = membersResult.status === 'rejected' ? membersResult.reason : membersResult.value?.error;
              // Solo loggear si no es un error de permisos común
              if (error && error.code !== 'PGRST301' && error.code !== '42501') {
                console.warn('⚠️ Error cargando miembros:', error);
              }
              // Fallback sin join
              try {
                const { data: membersSimple } = await this.supabase
                  .from('organization_members')
        .select('*')
                  .eq('organization_id', container.organization_id)
                  .limit(5);
                this.organizationMembers = (membersSimple || []).map(m => ({ ...m, users: null }));
              } catch (fallbackError) {
                console.warn('⚠️ Error en fallback miembros:', fallbackError);
                this.organizationMembers = [];
              }
            }
            
            // Credits
            if (creditsResult.status === 'fulfilled' && !creditsResult.value.error) {
              this.organizationCredits = creditsResult.value.data || { credits_available: 100 };
            } else {
              const error = creditsResult.status === 'rejected' ? creditsResult.reason : creditsResult.value?.error;
              if (error && error.code !== 'PGRST116') {
                console.warn('⚠️ Error cargando créditos:', error);
              }
              this.organizationCredits = { credits_available: 100 };
            }
            
            // Usage
            if (usageResult.status === 'fulfilled' && !usageResult.value.error) {
              this.creditUsage = usageResult.value.data || [];
            } else {
              const error = usageResult.status === 'rejected' ? usageResult.reason : usageResult.value?.error;
              if (error && error.code !== 'PGRST116') {
                console.warn('⚠️ Error cargando uso:', error);
              }
              this.creditUsage = [];
            }
          } catch (error) {
            console.warn('⚠️ Error en Promise.allSettled organización:', error);
            this.organizationMembers = [];
            this.organizationCredits = { credits_available: 100 };
            this.creditUsage = [];
          }
        }
      }
    } catch (error) {
      console.error('❌ Error crítico cargando datos:', error);
    }
  }

  // ============================================
  // RENDERIZADO SIMPLIFICADO
  // ============================================

  renderAll() {
    if (!this.isActive) return;
    this.renderBrandName();
    this.renderLinks();
    this.renderMarket();
    this.renderCards();
  }

  renderBrandName() {
    const el = document.getElementById('brandNameLarge');
    if (el) {
      el.textContent = (this.brandContainerData?.nombre_marca || 'BRAND').toUpperCase();
    }
  }

  renderLinks() {
    const links = {
      linkWebsite: this.brandContainerData?.sitio_web,
      linkInstagram: this.brandContainerData?.instagram_url,
      linkTikTok: this.brandContainerData?.tiktok_url,
      linkFacebook: this.brandContainerData?.facebook_url
    };
    
    Object.entries(links).forEach(([id, url]) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = url ? 'flex' : 'none';
        if (url) el.href = url;
      }
    });
  }

  renderMarket() {
    const el = document.getElementById('brandMarketLabel');
    if (el) {
      const mercado = this.brandContainerData?.mercado_objetivo;
      el.textContent = Array.isArray(mercado) ? mercado.join(', ') : (mercado || '');
    }
  }

  renderCards() {
    // Visual de marca - Brand Colors
    this.renderBrandColors();
    
    // Visual de marca - Typography
    this.renderTypography();
    
    // Visual de marca - Status
    this.renderVisualStatus();

    // Archivos de identidad
    this.renderIdentityFiles();
    
    // Setup event listeners para INFO
    this.setupEventListeners();
  }


  renderBrandColors() {
    // Buscar dentro del container específico primero
    const container = (this.container && this.container.querySelector('#brandColorSwatches')) || 
                      document.getElementById('brandColorSwatches');
    if (!container) {
      console.warn('⚠️ brandColorSwatches container no encontrado. Verificando DOM...');
      // Debug: verificar qué hay en el container
      if (this.container) {
        const html = this.container.innerHTML;
        console.log('Container HTML length:', html.length);
        console.log('Container HTML preview:', html.substring(0, 1000));
        console.log('¿Tiene brandColorSwatches?', html.includes('brandColorSwatches'));
        console.log('¿Tiene card-concept?', html.includes('card-concept'));
      }
      return;
    }
    
    const colors = (this.brandColors || []).slice(0, 6); // Máx 6 colores
    
    if (colors.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted, #6B7280); font-size: 0.75rem; padding: 0.5rem 0;">No colors defined</div>';
      return;
    }

    container.innerHTML = colors.map(color => {
      // Según schema: brand_colors tiene hex_value y color_role
      const hex = color.hex_value || color.hex_code || color.color_value || color.hex || '#000000';
      const role = color.color_role || color.role || color.name || 'Color';
      
      return `
        <div class="color-swatch" style="background: ${hex};">
          <div class="color-swatch-tooltip">
            <div class="color-swatch-hex">${hex.toUpperCase()}</div>
            <div class="color-swatch-role">${role}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderTypography() {
    // Buscar dentro del container específico primero
    const container = (this.container && this.container.querySelector('#typographyPreview')) || 
                      document.getElementById('typographyPreview');
    if (!container) {
      console.warn('⚠️ typographyPreview container no encontrado');
      return;
    }
    
    // Buscar regla de tipografía en brand_rules
    const typographyRule = (this.brandRules || []).find(rule => 
      rule.rule_type === 'typography' || 
      rule.category === 'typography' ||
      rule.rule_name?.toLowerCase().includes('font') ||
      rule.rule_name?.toLowerCase().includes('tipografia')
    );
    
    if (!typographyRule) {
      container.innerHTML = `
        <div class="typography-font-name">No typography defined</div>
        <div class="typography-samples">
          <div class="typography-sample body" style="color: var(--text-muted, #6B7280); font-size: 0.75rem;">Add typography in brand guidelines</div>
        </div>
      `;
      return;
    }

    // Extraer información de tipografía
    const fontName = typographyRule.font_family || typographyRule.value || 'Inter';
    const fontWeight = typographyRule.font_weight || '400';
    
    container.innerHTML = `
      <div class="typography-font-name">${fontName}</div>
      <div class="typography-samples">
        <div class="typography-sample heading" style="font-family: '${fontName}', sans-serif; font-weight: ${fontWeight === '400' ? '600' : fontWeight};">Heading</div>
        <div class="typography-sample body" style="font-family: '${fontName}', sans-serif; font-weight: ${fontWeight};">Body</div>
        </div>
    `;
  }

  renderVisualStatus() {
    // Buscar dentro del container específico primero
    const container = (this.container && this.container.querySelector('#visualStatus')) || 
                      document.getElementById('visualStatus');
    if (!container) {
      console.warn('⚠️ visualStatus container no encontrado');
      return;
    }

    const colorCount = (this.brandColors || []).length;
    // Según schema: buscar rule_type === 'typography'
    const hasTypography = (this.brandRules || []).some(rule => 
      rule.rule_type === 'typography' || 
      rule.rule_type?.toLowerCase() === 'typography'
    );
    const fontCount = hasTypography ? 1 : 0;
    
    container.innerHTML = `
      <div class="visual-status-synced">
        ${colorCount} Colors • ${fontCount} Font • Synced
        </div>
    `;
  }

  renderIdentityFiles() {
    const container = (this.container && this.container.querySelector('#identityFilesContainer')) || 
                      document.getElementById('identityFilesContainer');
    if (!container) {
      console.warn('⚠️ identityFilesContainer no encontrado');
      return;
    }

    const assets = (this.brandAssets || []).slice(0, 3); // Máx 3 archivos
    
    if (assets.length === 0) {
      container.innerHTML = `
        <div class="identity-file-empty">
          <div class="identity-file-empty-text">No files uploaded</div>
          <div class="identity-file-empty-hint">Upload brand identity files</div>
        </div>
      `;
      return;
    }

    container.innerHTML = assets.map(asset => {
      const fileName = asset.file_name || 'File';
      const fileType = asset.file_type || asset.asset_type || 'file';
      const fileUrl = asset.file_url || '';
      const uploadDate = asset.created_at ? new Date(asset.created_at) : null;
      
      // Validar URL antes de usarla
      const isValidUrl = fileUrl && 
        (fileUrl.startsWith('http://') || 
         fileUrl.startsWith('https://') || 
         fileUrl.startsWith('/'));
      
      // Icono según tipo de archivo
      let icon = 'fa-file';
      if (fileType.includes('image') || fileType.includes('logo')) {
        icon = 'fa-image';
      } else if (fileType.includes('pdf')) {
        icon = 'fa-file-pdf';
      } else if (fileType.includes('vector')) {
        icon = 'fa-file-image';
      }

      const dateText = uploadDate 
        ? `Uploaded · ${uploadDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : '';

      return `
        <div class="identity-file-item">
          <div class="identity-file-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="identity-file-info">
            <div class="identity-file-name">${this.escapeHtml(fileName)}</div>
            ${dateText ? `<div class="identity-file-date">${dateText}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupEventListeners() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoBtn = container.querySelector('.card-info');
    if (infoBtn) {
      infoBtn.style.cursor = 'pointer';
      infoBtn.addEventListener('click', () => {
        this.openInfoPanel();
      });
    }
  }

  // ============================================
  // PANEL INFO EXPANDIDO
  // ============================================

  openInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoCard = container.querySelector('.card-info');
    if (!infoCard) return;
    
    const cardsZone = container.querySelector('.brand-cards-zone');
    const otherCards = cardsZone ? Array.from(cardsZone.querySelectorAll('.brand-card:not(.card-info)')) : [];
    const cornerInfo = container.querySelector('.brand-corner-bottom-left');
    
    // Crear contenido expandido dentro de la card
    const existingContent = infoCard.querySelector('.card-content-expanded');
    if (existingContent) {
      // Ya está expandido
      return;
    }
    
    const content = document.createElement('div');
    content.className = 'card-content-expanded';
    content.id = 'infoPanelContent';
    
    // Renderizar contenido
    this.renderInfoPanelContent(content);
    
    // Agregar botón cerrar al header
    const header = infoCard.querySelector('.card-header');
    if (header) {
      const existingClose = header.querySelector('.info-close-btn');
      if (!existingClose) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'info-close-btn';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeInfoPanel();
        });
        header.appendChild(closeBtn);
      }
    }
    
    // Agregar contenido a la card
    infoCard.appendChild(content);
    
    // Obtener contenedor principal
    const dashboardContainer = container.querySelector('.brand-dashboard-container') || container;
    
    // Guardar estado ANTES de hacer cambios
    this.infoPanelState = {
      otherCards,
      cornerInfo,
      infoCard,
      dashboardContainer,
      cardsZone
    };
    
    // Ocultar otras cards y nombre de marca con fade out
    otherCards.forEach(card => {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-20px)';
    });
    
    if (cornerInfo) {
      cornerInfo.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      cornerInfo.style.opacity = '0';
      cornerInfo.style.transform = 'translateY(20px)';
    }
    
    // Cambiar a modo secundario: centrado con márgenes (con delay para animación)
    setTimeout(() => {
      dashboardContainer.classList.add('info-mode-secondary');
      dashboardContainer.classList.remove('info-expanded'); // Limpiar clase antigua si existe
      
      // Mover la card fuera del contenedor de cards al contenedor principal
      infoCard.classList.add('expanded');
      dashboardContainer.appendChild(infoCard);
      
      // Animación de entrada de la card
      requestAnimationFrame(() => {
        infoCard.style.opacity = '0';
        infoCard.style.transform = 'scale(0.95) translateY(20px)';
        infoCard.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        
        requestAnimationFrame(() => {
          infoCard.style.opacity = '1';
          infoCard.style.transform = 'scale(1) translateY(0)';
        });
      });
    }, 200); // Delay para que las otras cards se oculten primero
  }

  closeInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoCard = container.querySelector('.card-info.expanded');
    if (!infoCard) return;
    
    if (!this.infoPanelState) return;
    
    const { dashboardContainer, cardsZone, otherCards, cornerInfo } = this.infoPanelState;
    
    // Animación de salida de la card
    infoCard.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    infoCard.style.opacity = '0';
    infoCard.style.transform = 'scale(0.95) translateY(-20px)';
    
    // Esperar a que termine la animación de salida
    setTimeout(() => {
      // Remover clase expandida de la card
      infoCard.classList.remove('expanded');
      
      // Limpiar estilos de la card
      infoCard.style.position = '';
      infoCard.style.top = '';
      infoCard.style.right = '';
      infoCard.style.width = '';
      infoCard.style.height = '';
      infoCard.style.transition = '';
      infoCard.style.margin = '';
      infoCard.style.maxWidth = '';
      infoCard.style.opacity = '';
      infoCard.style.transform = '';
      
      // Remover contenido expandido
      const content = infoCard.querySelector('.card-content-expanded');
      if (content) {
        content.remove();
      }
      
      // Remover botón cerrar
      const closeBtn = infoCard.querySelector('.info-close-btn');
      if (closeBtn) {
        closeBtn.remove();
      }
      
      // Devolver la card al contenedor de cards (al inicio) ANTES de cambiar modo
      if (cardsZone) {
        cardsZone.insertBefore(infoCard, cardsZone.firstChild);
      }
      
      // Volver a modo principal: remover modo secundario
      if (dashboardContainer) {
        dashboardContainer.classList.remove('info-mode-secondary');
      }
      
      // Pequeño delay para que el cambio de modo se aplique
      requestAnimationFrame(() => {
        // Mostrar otras cards y nombre de marca con fade in
        if (otherCards && otherCards.length > 0) {
          otherCards.forEach(card => {
            // Asegurar que las cards estén visibles
            if (card.parentElement) {
              card.style.transition = 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }
          });
        }
        
        if (cornerInfo && cornerInfo.parentElement) {
          cornerInfo.style.transition = 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s';
          cornerInfo.style.opacity = '1';
          cornerInfo.style.transform = 'translateY(0)';
        }
        
        // Limpiar estilos después de la animación
        setTimeout(() => {
          if (otherCards) {
            otherCards.forEach(card => {
              card.style.transition = '';
              card.style.opacity = '';
              card.style.transform = '';
            });
          }
          
          if (cornerInfo) {
            cornerInfo.style.transition = '';
            cornerInfo.style.opacity = '';
            cornerInfo.style.transform = '';
          }
          
          this.infoPanelState = null;
        }, 700);
      });
    }, 400); // Tiempo de animación de salida
  }

  renderInfoPanelContent(container) {
    if (!container) return;
    
    const brandContainer = this.brandContainerData;
    const brand = this.brandData;
    
    // Agrupar reglas por tipo
    const rulesByType = {};
    (this.brandRules || []).forEach(rule => {
      const type = rule.rule_type || 'other';
      if (!rulesByType[type]) {
        rulesByType[type] = [];
      }
      rulesByType[type].push(rule);
    });
    
    container.innerHTML = `
      <!-- IDENTIDAD -->
      <section class="info-section">
        <h3 class="info-section-title">Identidad</h3>
        <div class="info-section-content">
          <div class="info-identity-grid">
            ${this.renderIdentitySection(brandContainer, brand)}
          </div>
        </div>
      </section>

      <!-- ESENCIA -->
      <section class="info-section">
        <h3 class="info-section-title">Esencia</h3>
        <div class="info-section-content">
          ${this.renderEssenceSection(brand)}
        </div>
      </section>

      <!-- LENGUAJE -->
      <section class="info-section">
        <h3 class="info-section-title">Lenguaje</h3>
        <div class="info-section-content">
          ${this.renderLanguageSection(brand)}
        </div>
      </section>

      <!-- REGLAS CREATIVAS -->
      <section class="info-section">
        <h3 class="info-section-title">Reglas Creativas</h3>
        <div class="info-section-content">
          ${this.renderCreativeRulesSection(brand, rulesByType)}
        </div>
      </section>
    `;
  }

  renderIdentitySection(brandContainer, brand) {
    const logoUrl = brandContainer?.logo_url;
    const nombreMarca = brandContainer?.nombre_marca || 'Sin nombre';
    const updatedAt = brandContainer?.updated_at 
      ? new Date(brandContainer.updated_at).toLocaleDateString('es-ES', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'No disponible';
    
    // Validar URL del logo antes de renderizar
    const isValidLogoUrl = logoUrl && 
      (logoUrl.startsWith('http://') || 
       logoUrl.startsWith('https://') || 
       logoUrl.startsWith('/'));
    
    return `
      <div class="info-identity-item">
        <div class="info-identity-label">Logo</div>
        <div class="info-identity-value">
          ${isValidLogoUrl 
            ? `<img src="${this.escapeHtml(logoUrl)}" alt="${this.escapeHtml(nombreMarca)}" class="info-logo-preview" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'info-logo-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'; console.warn('⚠️ Error cargando logo:', '${this.escapeHtml(logoUrl)}');">`
            : '<div class="info-logo-placeholder"><i class="fas fa-image"></i></div>'
          }
        </div>
      </div>
      <div class="info-identity-item">
        <div class="info-identity-label">Nombre</div>
        <div class="info-identity-value">${this.escapeHtml(nombreMarca)}</div>
      </div>
      <div class="info-identity-item">
        <div class="info-identity-label">Última actualización</div>
        <div class="info-identity-value">${updatedAt}</div>
      </div>
    `;
  }

  renderEssenceSection(brand) {
    if (!brand) {
      return '<p class="info-empty">No hay información de esencia disponible.</p>';
    }
    
    const quienesSomos = brand.quienes_somos || '';
    const personalidad = brand.personalidad_marca || '';
    const objetivos = brand.objetivos_marca || [];
    
    let html = '';
    
    if (quienesSomos) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Quiénes somos</div>
          <div class="info-field-value">${this.escapeHtml(quienesSomos)}</div>
        </div>
      `;
    }
    
    if (personalidad) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Personalidad</div>
          <div class="info-field-value">${this.escapeHtml(personalidad)}</div>
        </div>
      `;
    }
    
    if (objetivos && Array.isArray(objetivos) && objetivos.length > 0) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Objetivos</div>
          <div class="info-field-value">
            <ul class="info-list">
              ${objetivos.map(obj => `<li>${this.escapeHtml(String(obj))}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
    
    return html || '<p class="info-empty">No hay información de esencia disponible.</p>';
  }

  renderLanguageSection(brand) {
    if (!brand) {
      return '<p class="info-empty">No hay información de lenguaje disponible.</p>';
    }
    
    const tonoVoz = brand.tono_voz || '';
    const palabrasUsar = brand.palabras_usar || '';
    const palabrasEvitar = brand.palabras_evitar || [];
    
    let html = '';
    
    if (tonoVoz) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Tono de voz</div>
          <div class="info-field-value">${this.escapeHtml(String(tonoVoz))}</div>
        </div>
      `;
    }
    
    if (palabrasUsar) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Palabras a usar</div>
          <div class="info-field-value">${this.escapeHtml(palabrasUsar)}</div>
        </div>
      `;
    }
    
    if (palabrasEvitar && Array.isArray(palabrasEvitar) && palabrasEvitar.length > 0) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Palabras a evitar</div>
          <div class="info-field-value">
            <ul class="info-list">
              ${palabrasEvitar.map(pal => `<li>${this.escapeHtml(String(pal))}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
    
    return html || '<p class="info-empty">No hay información de lenguaje disponible.</p>';
  }

  renderCreativeRulesSection(brand, rulesByType) {
    const reglasCreativas = brand?.reglas_creativas || '';
    const hasRules = Object.keys(rulesByType).length > 0 || reglasCreativas;
    
    if (!hasRules) {
      return '<p class="info-empty">No hay reglas creativas definidas.</p>';
    }
    
    let html = '';
    
    if (reglasCreativas) {
      html += `
        <div class="info-field">
          <div class="info-field-label">Reglas generales</div>
          <div class="info-field-value">${this.escapeHtml(reglasCreativas)}</div>
        </div>
      `;
    }
    
    // Renderizar reglas desde brand_rules
    Object.entries(rulesByType).forEach(([type, rules]) => {
      if (type === 'typography') return; // Ya se muestra en Visual de marca
      
      rules.forEach(rule => {
        const ruleValue = rule.rule_value || {};
        const ruleName = ruleValue.name || ruleValue.title || type;
        const ruleContent = ruleValue.content || ruleValue.description || ruleValue.value || '';
        
        if (ruleContent) {
          html += `
            <div class="info-field">
              <div class="info-field-label">${this.escapeHtml(String(ruleName))}</div>
              <div class="info-field-value">${this.escapeHtml(String(ruleContent))}</div>
            </div>
          `;
        }
      });
    });
    
    return html || '<p class="info-empty">No hay reglas creativas definidas.</p>';
  }
}

window.BrandsView = BrandsView;
