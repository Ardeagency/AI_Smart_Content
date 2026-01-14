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

  async init() {
    await this.initSupabase();
    await this.loadData();
    if (this.isActive) {
      this.renderAll();
    }
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

    // SCREENING ROOM
    const total = this.organizationCredits?.credits_available || 100;
    const used = (this.creditUsage || []).reduce((s, u) => s + (u.credits_used || 0), 0);
    const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    
    const screeningCurrent = document.getElementById('screeningCurrentValue');
    const progressTime = document.getElementById('progressTime');
    const progressBar = document.getElementById('progressBarFill');
    const footer = document.getElementById('screeningFooterText');
    
    if (screeningCurrent) screeningCurrent.textContent = 'CONTENT PRODUCTION';
    if (progressTime) progressTime.textContent = `${used} / ${total}`;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (footer) footer.textContent = `${total - used} tokens available`;

    // EVENTS
    const product = this.products?.[0];
    const eventName = document.getElementById('eventName1');
    const eventDesc = document.getElementById('eventDesc1');
    const eventDate = document.getElementById('eventDate1');
    const eventTime = document.getElementById('eventTime1');
    
    if (product) {
      if (eventName) eventName.textContent = product.nombre_producto || 'Product';
      if (eventDesc) eventDesc.textContent = (product.descripcion_producto || '').substring(0, 40) || 'Featured';
      if (product.created_at) {
        const d = new Date(product.created_at);
        if (eventDate) eventDate.textContent = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        if (eventTime) eventTime.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      if (eventName) eventName.textContent = 'No Products';
      if (eventDesc) eventDesc.textContent = 'Add your first product';
      if (eventDate) eventDate.textContent = '-';
      if (eventTime) eventTime.textContent = '-';
    }
  }


  renderBrandColors() {
    const container = document.getElementById('brandColorSwatches');
    if (!container) return;
    
    const colors = (this.brandColors || []).slice(0, 6); // Máx 6 colores
    
    if (colors.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted, #6B7280); font-size: 0.75rem;">No colors defined</div>';
      return;
    }
    
    container.innerHTML = colors.map(color => {
      const hex = color.hex_code || color.color_value || '#000000';
      const role = color.role || color.color_role || 'Color';
      
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
    const container = document.getElementById('typographyPreview');
    if (!container) return;
    
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
    const container = document.getElementById('visualStatus');
    if (!container) return;
    
    const colorCount = (this.brandColors || []).length;
    const hasTypography = (this.brandRules || []).some(rule => 
      rule.rule_type === 'typography' || 
      rule.category === 'typography' ||
      rule.rule_name?.toLowerCase().includes('font') ||
      rule.rule_name?.toLowerCase().includes('tipografia')
    );
    const fontCount = hasTypography ? 1 : 0;
    
    container.innerHTML = `
      <div class="visual-status-synced">
        ${colorCount} Colors • ${fontCount} Font • Synced
      </div>
    `;
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
