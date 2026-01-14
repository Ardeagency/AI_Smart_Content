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

    // Production Usage
    this.renderProductionUsage();

    // Featured Products
    this.renderFeaturedProducts();
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

  renderProductionUsage() {
    // Estado actual
    const currentEl = (this.container && this.container.querySelector('#productionCurrentValue')) || 
                      document.getElementById('productionCurrentValue');
    if (currentEl) {
      currentEl.textContent = 'Content Production';
    }

    // Tokens
    const total = this.organizationCredits?.credits_available || this.organizationCredits?.credits_total || 2000;
    const used = (this.creditUsage || []).reduce((s, u) => s + (u.credits_used || 0), 0);
    const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    
    const tokensTextEl = (this.container && this.container.querySelector('#tokensText')) || 
                        document.getElementById('tokensText');
    const tokensBarEl = (this.container && this.container.querySelector('#tokensBarFill')) || 
                        document.getElementById('tokensBarFill');
    
    if (tokensTextEl) {
      tokensTextEl.textContent = `${used} / ${total} tokens`;
    }
    if (tokensBarEl) {
      tokensBarEl.style.width = `${pct}%`;
    }

    // Ritmo: outputs hoy y esta semana
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const outputsToday = (this.creditUsage || []).filter(u => {
      if (!u.created_at) return false;
      const usageDate = new Date(u.created_at);
      return usageDate >= todayStart && u.operation_type && u.operation_type.includes('content');
    }).length;

    const outputsWeek = (this.creditUsage || []).filter(u => {
      if (!u.created_at) return false;
      const usageDate = new Date(u.created_at);
      return usageDate >= weekStart && u.operation_type && u.operation_type.includes('content');
    }).length;

    const rhythmTodayEl = (this.container && this.container.querySelector('#rhythmToday')) || 
                          document.getElementById('rhythmToday');
    const rhythmWeekEl = (this.container && this.container.querySelector('#rhythmWeek')) || 
                         document.getElementById('rhythmWeek');
    
    if (rhythmTodayEl) {
      rhythmTodayEl.textContent = `${outputsToday} outputs today`;
    }
    if (rhythmWeekEl) {
      rhythmWeekEl.textContent = `${outputsWeek} this week`;
    }
  }

  renderFeaturedProducts() {
    const product = this.products?.[0];
    
    const productNameEl = (this.container && this.container.querySelector('#featuredProductName')) || 
                          document.getElementById('featuredProductName');
    const productCategoryEl = (this.container && this.container.querySelector('#featuredProductCategory')) || 
                              document.getElementById('featuredProductCategory');
    const productActivityEl = (this.container && this.container.querySelector('#featuredProductActivity')) || 
                             document.getElementById('featuredProductActivity');
    
    if (product) {
      // Nombre del producto
      if (productNameEl) {
        productNameEl.textContent = product.nombre_producto || 'Product';
      }
      
      // Categoría (tipo de producto)
      if (productCategoryEl) {
        const tipo = product.tipo_producto || '';
        productCategoryEl.textContent = tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : '';
        productCategoryEl.style.display = tipo ? 'block' : 'none';
      }
      
      // Última actividad (última generación de contenido relacionada)
      if (productActivityEl) {
        // Buscar última actividad relacionada en credit_usage o usar created_at del producto
        let lastActivity = '';
        if (product.updated_at) {
          const d = new Date(product.updated_at);
          lastActivity = `Last content generated · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (product.created_at) {
          const d = new Date(product.created_at);
          lastActivity = `Created · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        } else {
          lastActivity = 'No activity yet';
        }
        productActivityEl.textContent = lastActivity;
      }
    } else {
      if (productNameEl) productNameEl.textContent = 'No products';
      if (productCategoryEl) productCategoryEl.textContent = '';
      if (productActivityEl) productActivityEl.textContent = 'Add your first product';
    }
  }

  setupEventListeners() {
    const infoBtn = document.querySelector('.card-info');
    if (infoBtn) {
      infoBtn.style.cursor = 'pointer';
      infoBtn.addEventListener('click', () => {
        console.log('INFO clicked');
      });
    }
  }
}

window.BrandsView = BrandsView;
