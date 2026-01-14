/**
 * BrandsView - Vista de marcas (Dashboard Premium)
 * Diseño minimalista con fondo cálido y cards oscuras
 */
class BrandsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'brands.html';
    this.supabase = null;
    this.userId = null;
    this.userData = null;
    this.brandContainerId = null;
    this.brandContainerData = null;
    this.brandData = null;
    this.products = [];
    this.brandColors = [];
    this.brandRules = [];
    this.organizationMembers = [];
    this.organizationCredits = null;
    this.creditUsage = [];
    this.flowRuns = [];
    this.organizationId = null;
    this.eventListenersSetup = false;
    
    // Timer ID para limpiar al salir
    this.timezoneTimerId = null;
    this.isActive = false;
  }

  async onEnter() {
    this.isActive = true;
    
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }
  }

  // Limpiar recursos al salir de la vista
  onLeave() {
    this.isActive = false;
    
    // Cancelar timer del timezone
    if (this.timezoneTimerId) {
      clearTimeout(this.timezoneTimerId);
      this.timezoneTimerId = null;
    }
  }

  async init() {
    await this.initSupabase();
    await this.loadData();
    
    // Solo renderizar si la vista sigue activa
    if (this.isActive) {
      this.renderDashboard();
      if (!this.eventListenersSetup) {
        this.setupEventListeners();
        this.eventListenersSetup = true;
      }
    }
  }

  async updateHeader() {
    await super.updateHeader();
    if (this.brandContainerData) {
      this.updateHeaderContext('Marcas', this.brandContainerData.nombre_marca);
    } else {
      this.updateHeaderContext('Marcas');
    }
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  // ============================================
  // CARGA DE DATOS
  // ============================================

  async loadData() {
    if (!this.supabase || !this.userId) return;

    try {
      // Usuario - usar maybeSingle para evitar error 400 si no existe
      const { data: userData, error: userError } = await this.supabase
        .from('users').select('*').eq('id', this.userId).maybeSingle();
      
      if (userError) {
        console.warn('⚠️ Error cargando usuario:', userError);
      } else {
        this.userData = userData;
      }

      // Brand container
      const { data: containerData, error: containerError } = await this.supabase
        .from('brand_containers').select('*').eq('user_id', this.userId).limit(1).maybeSingle();
      
      if (containerError) {
        console.warn('⚠️ Error cargando brand container:', containerError);
      } else if (containerData) {
        this.brandContainerId = containerData.id;
        this.brandContainerData = containerData;
        this.organizationId = containerData.organization_id;

        // Brand data
        const { data: brandData, error: brandError } = await this.supabase
          .from('brands').select('*').eq('project_id', this.brandContainerId).maybeSingle();
        
        if (brandError) {
          console.warn('⚠️ Error cargando brand data:', brandError);
        } else {
          this.brandData = brandData;
        }

        // Productos
        const { data: products, error: productsError } = await this.supabase
          .from('products').select('*').eq('brand_container_id', this.brandContainerId)
          .order('created_at', { ascending: false }).limit(5);
        
        if (productsError) {
          console.warn('⚠️ Error cargando productos:', productsError);
          this.products = [];
        } else {
          this.products = products || [];
        }

        // Colores y reglas
        if (this.brandData?.id) {
          const { data: colors, error: colorsError } = await this.supabase
            .from('brand_colors').select('*').eq('brand_id', this.brandData.id);
          
          if (colorsError) {
            console.warn('⚠️ Error cargando colores:', colorsError);
            this.brandColors = [];
          } else {
            this.brandColors = colors || [];
          }

          const { data: rules, error: rulesError } = await this.supabase
            .from('brand_rules').select('*').eq('brand_id', this.brandData.id);
          
          if (rulesError) {
            console.warn('⚠️ Error cargando reglas:', rulesError);
            this.brandRules = [];
          } else {
            this.brandRules = rules || [];
          }
        }

        // Datos de organización
        if (this.organizationId) {
          // Members - intentar con join primero, fallback sin join
          let members = [];
          const { data: membersWithUsers, error: membersError } = await this.supabase
            .from('organization_members')
            .select('*, users(id, full_name, email)')
            .eq('organization_id', this.organizationId)
            .limit(5);
          
          if (membersError) {
            console.warn('⚠️ Error cargando miembros con join:', membersError);
            // Fallback: cargar sin join
            const { data: membersSimple, error: simpleError } = await this.supabase
              .from('organization_members')
              .select('*')
              .eq('organization_id', this.organizationId)
              .limit(5);
            
            if (simpleError) {
              console.warn('⚠️ Error cargando miembros sin join:', simpleError);
              this.organizationMembers = [];
            } else {
              // Mapear a formato esperado sin users
              this.organizationMembers = (membersSimple || []).map(m => ({
                ...m,
                users: null
              }));
            }
          } else {
            this.organizationMembers = membersWithUsers || [];
          }

          const { data: credits, error: creditsError } = await this.supabase
            .from('organization_credits').select('*')
            .eq('organization_id', this.organizationId).maybeSingle();
          
          if (creditsError) {
            console.warn('⚠️ Error cargando créditos:', creditsError);
            this.organizationCredits = { credits_available: 100 };
          } else {
            this.organizationCredits = credits || { credits_available: 100 };
          }

          const { data: usage, error: usageError } = await this.supabase
            .from('credit_usage').select('*')
            .eq('organization_id', this.organizationId)
            .order('created_at', { ascending: false }).limit(10);
          
          if (usageError) {
            console.warn('⚠️ Error cargando uso de créditos:', usageError);
            this.creditUsage = [];
          } else {
            this.creditUsage = usage || [];
          }
        }
      }
      console.log('✅ Datos cargados');
    } catch (error) {
      console.error('❌ Error crítico cargando datos:', error);
    }
  }

  // ============================================
  // RENDERIZADO
  // ============================================

  renderDashboard() {
    if (!this.isActive) return;
    
    this.renderTeam();
    this.renderBrandInfo();
    this.renderConceptCard();
    this.renderScreeningCard();
    this.renderEventsCard();
    this.startTimezoneUpdate();
  }

  renderTeam() {
    const container = document.getElementById('teamAvatars');
    if (!container) return;

    if (!this.organizationMembers?.length) {
      container.innerHTML = '<div class="team-avatar-placeholder"><i class="fas fa-users"></i></div>';
      return;
    }

    container.innerHTML = this.organizationMembers.slice(0, 5).map(m => {
      const user = m.users;
      // Manejar caso donde users puede ser null o un array
      const userObj = Array.isArray(user) ? user[0] : user;
      const initials = userObj?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
        || userObj?.email?.[0]?.toUpperCase() 
        || 'U';
      const displayName = userObj?.full_name || userObj?.email || 'Usuario';
      return `<div class="team-avatar" title="${this.escapeHtml(displayName)}">
        <span class="team-avatar-initials">${initials}</span>
      </div>`;
    }).join('') + (this.organizationMembers.length > 5 
      ? `<div class="team-avatar team-avatar-more">+${this.organizationMembers.length - 5}</div>` : '');
  }

  renderBrandInfo() {
    if (!this.brandContainerData) return;

    const brandName = this.brandContainerData.nombre_marca || 'BRAND';
    
    const nameEl = document.getElementById('brandNameLarge');
    if (nameEl) nameEl.textContent = brandName.toUpperCase();

    this.setLinkVisibility('linkWebsite', this.brandContainerData.sitio_web);
    this.setLinkVisibility('linkInstagram', this.brandContainerData.instagram_url);
    this.setLinkVisibility('linkTikTok', this.brandContainerData.tiktok_url);
    this.setLinkVisibility('linkFacebook', this.brandContainerData.facebook_url);

    const marketEl = document.getElementById('brandMarketLabel');
    if (marketEl) {
      const mercado = this.brandContainerData.mercado_objetivo;
      marketEl.textContent = Array.isArray(mercado) ? mercado.join(', ') : (mercado || '');
    }
  }

  setLinkVisibility(id, url) {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = url ? 'flex' : 'none';
      if (url) el.href = url;
    }
  }

  renderConceptCard() {
    const current = document.getElementById('conceptCurrentValue');
    const stats = document.getElementById('conceptStatsValue');
    
    if (current) current.textContent = this.brandData?.tono_voz?.toUpperCase() || 'BRAND GUIDELINES';
    if (stats) stats.textContent = `${this.brandRules?.length || 0} Guidelines • ${this.brandColors?.length || 0} Colors`;
  }

  renderScreeningCard() {
    const total = this.organizationCredits?.credits_available || 100;
    const used = this.creditUsage.reduce((s, u) => s + (u.credits_used || 0), 0);
    const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;

    const current = document.getElementById('screeningCurrentValue');
    const time = document.getElementById('progressTime');
    const bar = document.getElementById('progressBarFill');
    const footer = document.getElementById('screeningFooterText');

    if (current) current.textContent = this.flowRuns?.[0]?.status?.toUpperCase() || 'CONTENT PRODUCTION';
    if (time) time.textContent = `${used} / ${total}`;
    if (bar) bar.style.width = `${pct}%`;
    if (footer) footer.textContent = `${total - used} tokens available`;
  }

  renderEventsCard() {
    const name = document.getElementById('eventName1');
    const desc = document.getElementById('eventDesc1');
    const date = document.getElementById('eventDate1');
    const time = document.getElementById('eventTime1');

    if (this.products?.length > 0) {
      const p = this.products[0];
      if (name) name.textContent = p.nombre_producto || 'Product';
      if (desc) desc.textContent = p.descripcion_producto?.substring(0, 40) || 'Featured';
      if (p.created_at) {
        const d = new Date(p.created_at);
        if (date) date.textContent = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        if (time) time.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      if (name) name.textContent = 'No Products';
      if (desc) desc.textContent = 'Add your first product';
      if (date) date.textContent = '-';
      if (time) time.textContent = '-';
    }
  }

  // Timer controlado con limpieza
  startTimezoneUpdate() {
    // Cancelar timer anterior si existe
    if (this.timezoneTimerId) {
      clearTimeout(this.timezoneTimerId);
      this.timezoneTimerId = null;
    }
    
    // Solo actualizar si la vista está activa
    if (!this.isActive) return;
    
    const timeEl = document.getElementById('timeLocal');
    const zoneEl = document.getElementById('timeZone');
    
    if (timeEl && zoneEl) {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      zoneEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ');
      
      // Solo programar siguiente actualización si sigue activa
      if (this.isActive) {
        this.timezoneTimerId = setTimeout(() => this.startTimezoneUpdate(), 60000);
      }
    }
  }

  setupEventListeners() {
    const infoBtn = document.querySelector('.card-info');
    if (infoBtn) {
      infoBtn.style.cursor = 'pointer';
      infoBtn.addEventListener('click', () => {
        console.log('INFO clicked - expandir lineamientos (TODO)');
      });
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.BrandsView = BrandsView;
