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
    this.timezoneTimerId = null;
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
      const { data: container } = await this.supabase
        .from('brand_containers')
        .select('*')
        .eq('user_id', this.userId)
        .limit(1)
        .maybeSingle();
      
      if (container) {
        this.brandContainerData = container;
        
        // Brand
        const { data: brand } = await this.supabase
          .from('brands')
          .select('*')
          .eq('project_id', container.id)
          .maybeSingle();
        this.brandData = brand || null;

        // Productos
        const { data: products } = await this.supabase
          .from('products')
          .select('*')
          .eq('brand_container_id', container.id)
          .limit(5);
        this.products = products || [];

        // Colores y reglas
        if (brand?.id) {
          const [colors, rules] = await Promise.all([
            this.supabase.from('brand_colors').select('*').eq('brand_id', brand.id),
            this.supabase.from('brand_rules').select('*').eq('brand_id', brand.id)
          ]);
          this.brandColors = colors.data || [];
          this.brandRules = rules.data || [];
        }

        // Organización
        if (container.organization_id) {
          const [members, credits, usage] = await Promise.all([
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
          
          this.organizationMembers = members.data || [];
          this.organizationCredits = credits.data || { credits_available: 100 };
          this.creditUsage = usage.data || [];
        }
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
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
    // CONCEPT LAB
    const current = document.getElementById('conceptCurrentValue');
    const stats = document.getElementById('conceptStatsValue');
    if (current) current.textContent = (this.brandData?.tono_voz || 'BRAND GUIDELINES').toUpperCase();
    if (stats) stats.textContent = `${this.brandRules.length || 0} Guidelines • ${this.brandColors.length || 0} Colors`;

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
