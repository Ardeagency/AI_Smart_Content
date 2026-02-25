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
    this.brandEntities = [];
    this.brandPlaces = [];
    this.brandAudiences = [];
    this.brandSocialLinks = [];
    this.organizationMembers = [];
    this.organizationCredits = { credits_available: 100 };
    this.creditUsage = [];
    this.isActive = false;
    this.savingFields = new Set();
    this._tryRenderTimeout = null;
    this._containerWarned = {};
    this._dataLoaded = false;
  }

  async onEnter() {
    this.isActive = true;
    this._containerWarned = {};
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
          window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  onLeave() {
    this.isActive = false;
    if (this._tryRenderTimeout) {
      clearTimeout(this._tryRenderTimeout);
      this._tryRenderTimeout = null;
    }
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    this.cleanup();
  }

  async render() {
    await super.render();
    if (!this.isActive) return;

    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    // Si el template no es el de marcas (p. ej. fetch devolvió error o index.html), no intentar renderAll
    const brandsRoot = container.querySelector('#brandsListContainer');
    if (!brandsRoot) {
      if (!this._containerWarned.template) {
        this._containerWarned.template = true;
        console.warn('⚠️ Vista Marcas: no se cargó el template (comprueba que /templates/brands.html esté disponible).');
      }
      return;
    }

    const checkContainers = () => {
      if (!this.isActive) return false;
      const brandColorsEl = container.querySelector('#brandColorSwatches') || document.getElementById('brandColorSwatches');
      const typographyEl = container.querySelector('#typographyPreview') || document.getElementById('typographyPreview');
      if (brandColorsEl && typographyEl) {
        this.renderAll();
        const root = container.querySelector('#brandsListContainer');
        if (root) root.classList.add('brands-ready');
        (async () => {
          await this.ensureDataLoaded();
          if (!this.isActive) return;
          this.applyBrandBackgroundGradient();
          if (root) root.classList.add('brands-background-ready');
        })();
        return true;
      }
      return false;
    };

    if (!checkContainers()) {
      this._domObserver = new MutationObserver(() => {
        if (checkContainers() && this._domObserver) {
          this._domObserver.disconnect();
          this._domObserver = null;
        }
      });
      this._domObserver.observe(container, { childList: true, subtree: true });
      setTimeout(() => {
        if (this._domObserver) {
          this._domObserver.disconnect();
          this._domObserver = null;
        }
      }, 2000);
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

  /**
   * Carga datos según schema.sql:
   * brand_containers, brands(project_id→container), brand_assets(brand_container_id),
   * brand_entities(brand_container_id), brand_places(entity_id), audiences(brand_id),
   * brand_colors(brand_id), brand_rules(brand_id, rule_type, rule_value),
   * products(brand_container_id), organization_members, organization_credits, credit_usage.
   */
  async loadData() {
    if (!this.supabase || !this.userId) {
      this._dataLoaded = true;
      return;
    }

    try {
      // brand_containers (user_id, organization_id, nombre_marca, mercado_objetivo, ...)
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

        // Redes sociales (brand_social_links: múltiples enlaces por plataforma)
        const { data: socialLinks, error: socialError } = await this.supabase
          .from('brand_social_links')
          .select('*')
          .eq('brand_container_id', container.id)
          .order('platform', { ascending: true })
          .order('created_at', { ascending: true });
        if (socialError) {
          console.warn('⚠️ Error cargando redes sociales:', socialError);
          this.brandSocialLinks = [];
        } else {
          this.brandSocialLinks = socialLinks || [];
        }

        // Brand Entities (identidad estructural)
        const { data: entities, error: entitiesError } = await this.supabase
          .from('brand_entities')
          .select('*')
          .eq('brand_container_id', container.id)
          .order('created_at', { ascending: true });
        
        if (entitiesError) {
          console.warn('⚠️ Error cargando brand entities:', entitiesError);
          this.brandEntities = [];
        } else {
          this.brandEntities = entities || [];
          
          // Cargar places asociados a las entidades
          if (this.brandEntities.length > 0) {
            const entityIds = this.brandEntities.map(e => e.id);
            const { data: places, error: placesError } = await this.supabase
              .from('brand_places')
              .select('*')
              .in('entity_id', entityIds)
              .order('created_at', { ascending: true });
            
            if (placesError) {
              console.warn('⚠️ Error cargando brand places:', placesError);
              this.brandPlaces = [];
            } else {
              this.brandPlaces = places || [];
            }
          } else {
            this.brandPlaces = [];
          }
        }

        // Audiences asociadas a la marca
        if (this.brandData?.id) {
          const { data: audiences, error: audiencesError } = await this.supabase
            .from('audiences')
            .select('*')
            .eq('brand_id', this.brandData.id)
            .order('created_at', { ascending: true });
          
          if (audiencesError) {
            console.warn('⚠️ Error cargando audiences:', audiencesError);
            this.brandAudiences = [];
          } else {
            this.brandAudiences = audiences || [];
          }
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
                .select('*, profiles(id, full_name, email)')
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
                this.organizationMembers = (membersSimple || []).map(m => ({ ...m, profiles: null }));
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
    } finally {
      this._dataLoaded = true;
    }
  }

  async ensureDataLoaded() {
    if (this._dataLoaded) return;
    await this.loadData();
  }

  /** Fuentes disponibles para tipografía en imágenes (dropdown en Visual de marca). */
  static TYPOGRAPHY_FONTS = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Lato', label: 'Lato' },
    { value: 'Montserrat', label: 'Montserrat' },
    { value: 'Poppins', label: 'Poppins' },
    { value: 'Playfair Display', label: 'Playfair Display' },
    { value: 'Oswald', label: 'Oswald' },
    { value: 'Raleway', label: 'Raleway' },
    { value: 'Bebas Neue', label: 'Bebas Neue' },
    { value: 'Source Sans 3', label: 'Source Sans 3' },
    { value: 'Nunito', label: 'Nunito' },
    { value: 'Work Sans', label: 'Work Sans' },
    { value: 'DM Sans', label: 'DM Sans' },
  ];

  // ============================================
  // DEGRADADO INTELIGENTE (misma lógica que HogarView / organización)
  // Usa brand_colors para construir un degradado primary → secondary.
  // ============================================

  /** Devuelve array de hex válidos desde this.brandColors (máx 4, sin duplicados). */
  getBrandColorsHexArray() {
    const colors = this.brandColors || [];
    const seen = new Set();
    const hexes = [];
    for (const row of colors) {
      const raw = (row.hex_value || '').trim();
      const clean = raw.replace(/^#/, '');
      if (!clean || !/^[0-9A-Fa-f]{6}$/.test(clean)) continue;
      const normalized = `#${clean}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        hexes.push(normalized);
        if (hexes.length >= 4) break;
      }
    }
    return hexes;
  }

  /** Convierte #rrggbb a rgba(r,g,b,alpha). */
  hexToRgba(hex, alpha = 1) {
    const clean = (hex || '').replace(/^#/, '');
    if (clean.length !== 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  hexToHSL(hex) {
    const clean = hex.replace(/^#/, '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  filterAndScoreBrandColors(hexes) {
    const MIN_L = 18, MAX_L = 85, MIN_S = 15, MAX_S = 90;
    const idealL = 45, idealS = 50;
    const out = [];
    for (const hex of hexes.slice(0, 5)) {
      const { h, s, l } = this.hexToHSL(hex);
      if (l > MAX_L || l < MIN_L || s < MIN_S || s > MAX_S) continue;
      const scoreL = 30 - Math.abs(l - idealL) / 2;
      const scoreS = 40 - Math.abs(s - idealS) / 2;
      const score = Math.max(0, scoreL + scoreS);
      out.push({ hex, h, s, l, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  getBrandUIPalette(brandColors) {
    if (!brandColors || brandColors.length === 0) return null;
    const filtered = this.filterAndScoreBrandColors(brandColors);
    if (filtered.length === 0) {
      const raw = brandColors[0];
      const { h, s, l } = this.hexToHSL(raw);
      const primary = this.hslToHex(h, Math.min(90, Math.max(20, s)), Math.min(75, Math.max(25, l)));
      const secondary = this.hslToHex(h, Math.min(85, s + 5), Math.max(15, l - 18));
      return { primary, secondary };
    }
    const primary = filtered[0].hex;
    let secondary = null;
    for (let i = 1; i < filtered.length; i++) {
      const diff = Math.abs(filtered[i].h - filtered[0].h);
      const hueDiff = Math.min(diff, 360 - diff);
      if (hueDiff > 20) {
        secondary = filtered[i].hex;
        break;
      }
    }
    if (!secondary) {
      const { h, s, l } = this.hexToHSL(primary);
      secondary = this.hslToHex(h, Math.min(90, s + 10), Math.max(18, l - 12));
    }
    return { primary, secondary };
  }

  /**
   * Construye un degradado que usa TODOS los colores de la marca (hasta 4),
   * con transparencia suave para que se mezclen bien y no se vean bloques opacos.
   */
  buildBrandGradientCss(hexes) {
    if (!hexes || hexes.length === 0) return '';
    const alpha = 0.88;
    const stops = hexes.map((hex, i) => {
      const pct = hexes.length === 1 ? 100 : (i / (hexes.length - 1)) * 100;
      return `${this.hexToRgba(hex, alpha)} ${Math.round(pct)}%`;
    });
    return `linear-gradient(135deg, ${stops.join(', ')})`;
  }

  /** Aplica el degradado de colores de marca al fondo (skeleton hace crossfade a esta capa). Sin colores usa neutro. */
  applyBrandBackgroundGradient(forceUpdate = false) {
    const container = this.container || document.getElementById('app-container');
    const gradientEl = (container && container.querySelector('.background-gradient')) || document.querySelector('.background-gradient');
    if (!gradientEl) return;
    const hexes = this.getBrandColorsHexArray();
    const colorsKey = hexes.join(',');
    if (!forceUpdate && this._cachedGradientKey === colorsKey) return;
    this._cachedGradientKey = colorsKey;

    const neutralBg = 'linear-gradient(145deg, #2d2a28 0%, #1f1d1b 50%, #252220 100%)';
    if (hexes.length) {
      const brandGradient = this.buildBrandGradientCss(hexes);
      gradientEl.style.background = `${brandGradient}, ${neutralBg}`;
      gradientEl.setAttribute('data-brand-gradient', 'true');
    } else {
      gradientEl.style.background = neutralBg;
      gradientEl.removeAttribute('data-brand-gradient');
    }
  }

  // ============================================
  // RENDERIZADO SIMPLIFICADO
  // ============================================

  renderAll() {
    if (!this.isActive) return;
    this.applyBrandBackgroundGradient();
    this.renderBrandName();
    this.renderMarket();
    this.renderCards();
  }

  renderBrandName() {
    const el = document.getElementById('brandNameLarge');
    if (el) {
      const name = (this.brandContainerData?.nombre_marca || '').trim();
      el.textContent = name ? name.toUpperCase() : '';
      this.makeEditableText(el, 'nombre_marca', 'container', () => {
        this.renderBrandName();
      });
    }
  }

  /** Plataformas permitidas para brand_social_links (múltiples enlaces por plataforma) */
  static getSocialPlatforms() {
    return [
      { value: 'website', icon: 'fas fa-globe', label: 'Website' },
      { value: 'instagram', icon: 'fab fa-instagram', label: 'Instagram' },
      { value: 'tiktok', icon: 'fab fa-tiktok', label: 'TikTok' },
      { value: 'facebook', icon: 'fab fa-facebook', label: 'Facebook' },
      { value: 'linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn' },
      { value: 'youtube', icon: 'fab fa-youtube', label: 'YouTube' },
      { value: 'twitter', icon: 'fab fa-twitter', label: 'Twitter/X' },
      { value: 'pinterest', icon: 'fab fa-pinterest', label: 'Pinterest' }
    ];
  }

  renderLinksInto(container) {
    if (!container) return;
    const links = this.brandSocialLinks || [];
    const platforms = BrandsView.getSocialPlatforms();
    const platformByValue = Object.fromEntries(platforms.map(p => [p.value, p]));

    let html = '';
    links.forEach(link => {
      const p = platformByValue[link.platform] || { icon: 'fas fa-link', label: link.platform };
      const url = (link.url || '').trim();
      html += `
        <li class="brand-link-row" data-link-id="${this.escapeHtml(link.id)}">
          <span class="brand-link-icon" aria-hidden="true"><i class="${p.icon}"></i></span>
          <input type="text" class="brand-link-input brand-link-url-input" value="${this.escapeHtml(url)}" placeholder="https://..." data-link-id="${this.escapeHtml(link.id)}" aria-label="URL ${this.escapeHtml(p.label)}">
          <span class="brand-link-platform-tag">${this.escapeHtml(p.label)}</span>
          <button type="button" class="brand-link-btn-delete" title="Eliminar"><i class="fas fa-times"></i></button>
        </li>`;
    });
    html += `<li class="brand-social-add">
      <label class="sr-only" for="brandSocialPlatform">Añadir red social</label>
      <select id="brandSocialPlatform" class="brand-social-platform-select" aria-label="Plataforma">
        <option value="">Plataforma...</option>
        ${platforms.map(p => `<option value="${this.escapeHtml(p.value)}">${this.escapeHtml(p.label)}</option>`).join('')}
      </select>
      <input type="url" id="brandSocialUrl" class="brand-social-url-input" placeholder="https://..." aria-label="URL">
      <button type="button" id="brandSocialAddBtn" class="brand-link-btn-add"><i class="fas fa-plus"></i> Añadir</button>
    </li>`;

    container.innerHTML = html;

    links.forEach(link => {
      const row = container.querySelector(`[data-link-id="${link.id}"]`);
      if (!row) return;
      const input = row.querySelector('.brand-link-url-input');
      const deleteBtn = row.querySelector('.brand-link-btn-delete');
      if (input) {
        input.addEventListener('blur', () => {
          const val = input.value.trim();
          if (val !== (link.url || '').trim()) this.updateSocialLink(link.id, val);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
        });
      }
      if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSocialLink(link.id));
    });

    const addPlatform = container.querySelector('#brandSocialPlatform');
    const addUrl = container.querySelector('#brandSocialUrl');
    const addBtn = container.querySelector('#brandSocialAddBtn');
    if (addBtn && addPlatform && addUrl) {
      addBtn.addEventListener('click', () => {
        const platform = (addPlatform.value || '').trim();
        const url = (addUrl.value || '').trim();
        if (!platform || !url) return;
        this.addSocialLink(platform, url).then(() => {
          addUrl.value = '';
          addPlatform.value = '';
        });
      });
      addUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
    }
  }

  async addSocialLink(platform, url) {
    if (!this.supabase || !this.brandContainerData) return;
    try {
      const { data, error } = await this.supabase
        .from('brand_social_links')
        .insert({
          brand_container_id: this.brandContainerData.id,
          platform: platform.toLowerCase(),
          url: url.trim(),
          is_primary: false
        })
        .select()
        .single();
      if (error) throw error;
      this.brandSocialLinks = [...(this.brandSocialLinks || []), data];
      const container = document.getElementById('brandLinksContainer');
      if (container) this.renderLinksInto(container);
    } catch (e) {
      console.error('Error añadiendo enlace:', e);
      alert(e?.message || 'No se pudo añadir el enlace.');
    }
  }

  async updateSocialLink(id, url) {
    if (!this.supabase) return;
    try {
      const { error } = await this.supabase
        .from('brand_social_links')
        .update({ url: url.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const link = this.brandSocialLinks.find(l => l.id === id);
      if (link) link.url = url.trim();
    } catch (e) {
      console.error('Error actualizando enlace:', e);
      alert(e?.message || 'No se pudo actualizar.');
    }
  }

  async deleteSocialLink(id) {
    if (!this.supabase) return;
    try {
      const { error } = await this.supabase.from('brand_social_links').delete().eq('id', id);
      if (error) throw error;
      this.brandSocialLinks = (this.brandSocialLinks || []).filter(l => l.id !== id);
      const container = document.getElementById('brandLinksContainer');
      if (container) this.renderLinksInto(container);
    } catch (e) {
      console.error('Error eliminando enlace:', e);
      alert(e?.message || 'No se pudo eliminar.');
    }
  }

  renderMarket() {
    const el = document.getElementById('brandMarketLabel');
    if (el) {
      const mercado = this.brandContainerData?.mercado_objetivo;
      el.setAttribute('data-field', 'mercado_objetivo');
      el.textContent = Array.isArray(mercado) && mercado.length > 0 
        ? mercado.join(', ') 
        : 'Click para agregar mercado objetivo';
      el.style.cursor = 'pointer';
      el.style.opacity = Array.isArray(mercado) && mercado.length > 0 ? '1' : '0.6';
      
      el.addEventListener('click', () => {
        this.makeEditableMultiSelect(el, 'mercado_objetivo', [], 'container', () => {
          this.renderMarket();
        });
      });
    }
  }

  renderCards() {
    this.applyBrandBackgroundGradient();
    // Visual de marca - Brand Colors
    this.renderBrandColors();
    
    // Visual de marca - Typography
    this.renderTypography();

    // Archivos de identidad
    this.renderIdentityFiles();
    this.setupFileUpload();
    
    // Setup event listeners para INFO
    this.setupEventListeners();
  }


  renderBrandColors() {
    const container = (this.container && this.container.querySelector('#brandColorSwatches')) ||
                      document.getElementById('brandColorSwatches');
    if (!container) {
      if (!this._containerWarned.brandColorSwatches) {
        this._containerWarned.brandColorSwatches = true;
        console.warn('⚠️ brandColorSwatches no encontrado');
      }
      return;
    }

    const MAX_COLORS = 4;
    const colors = (this.brandColors || []).slice(0, MAX_COLORS);

    const swatchesHtml = colors.map(color => {
      const hex = color.hex_value || color.hex_code || color.color_value || color.hex || '#000000';
      const colorId = color.id;
      return `
        <div class="color-swatch" style="background: ${hex};" data-color-id="${colorId}">
          <button type="button" class="color-delete-btn" title="Eliminar" aria-label="Eliminar color">×</button>
        </div>
      `;
    }).join('');

    const addBtnHtml = colors.length < MAX_COLORS
      ? `<button type="button" class="color-swatch-add-btn" title="Agregar color" aria-label="Agregar color"><span>+</span></button>`
      : '';

    container.innerHTML = swatchesHtml + addBtnHtml;

    container.querySelectorAll('.color-swatch').forEach(swatch => {
      const colorId = swatch.getAttribute('data-color-id');
      const color = colors.find(c => c.id === colorId);
      const deleteBtn = swatch.querySelector('.color-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteColor(colorId);
        });
      }
      swatch.addEventListener('click', (e) => {
        if (e.target.closest('.color-delete-btn')) return;
        if (color) this.openColorEditor(color);
      });
    });

    const addBtn = container.querySelector('.color-swatch-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openColorEditor(null));
    }
  }

  /**
   * Abre el editor de color (rueda de tono + saturación/luminosidad + hex + formato).
   * Si color es null, modo "agregar"; si es objeto, modo "editar". Límite 4 colores.
   */
  openColorEditor(color) {
    const isNew = !color || !color.id;
    const hex = color
      ? (color.hex_value || color.hex_code || color.hex || '#000000').replace(/^#/, '')
      : '6E3DE9';
    const initialHex = `#${hex.padStart(6, '0').slice(0, 6)}`;
    let { h, s, l } = this.hexToHSL(initialHex);
    const colorId = isNew ? null : color.id;
    const container = this.container || document.getElementById('app-container');
    if (!container) return;

    const closeEditor = () => {
      if (this._colorEditorModal && this._colorEditorModal.parentNode) {
        this._colorEditorModal.remove();
        this._colorEditorModal = null;
      }
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') closeEditor(); };
    document.addEventListener('keydown', onKeyDown);

    const setHexFromHSL = () => {
      const newHex = this.hslToHex(h, s, l);
      hexInput.value = newHex.toUpperCase();
      previewEl.style.background = newHex;
      slArea.style.background = `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
      return newHex;
    };

    const applyColor = async () => {
      const hexToSave = this.hslToHex(h, s, l);
      if (isNew) await this.createColor(hexToSave);
      else await this.updateColor(colorId, hexToSave);
      closeEditor();
    };

    const modal = document.createElement('div');
    modal.className = 'color-editor-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Editor de color');
    this._colorEditorModal = modal;

    const panel = document.createElement('div');
    panel.className = 'color-editor-panel';

    const wheelWrap = document.createElement('div');
    wheelWrap.className = 'color-editor-wheel-wrap';

    const hueRing = document.createElement('div');
    hueRing.className = 'color-editor-hue-ring';
    hueRing.setAttribute('aria-label', 'Seleccionar tono');

    const slArea = document.createElement('div');
    slArea.className = 'color-editor-sl-area';
    slArea.style.background = `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;

    const slHandle = document.createElement('div');
    slHandle.className = 'color-editor-sl-handle';
    const setSLHandlePos = () => {
      slHandle.style.left = `${s}%`;
      slHandle.style.top = `${100 - l}%`;
      slHandle.style.transform = 'translate(-50%, -50%)';
    };
    setSLHandlePos();

    const hueHandle = document.createElement('div');
    hueHandle.className = 'color-editor-hue-handle';
    hueHandle.style.transform = `rotate(${h}deg)`;

    const previewEl = document.createElement('div');
    previewEl.className = 'color-editor-current';
    previewEl.style.background = this.hslToHex(h, s, l);

    const hexWrap = document.createElement('div');
    hexWrap.className = 'color-editor-hex-wrap';
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'color-editor-hex-input';
    hexInput.value = this.hslToHex(h, s, l).toUpperCase().replace(/^#/, '');
    hexInput.setAttribute('maxlength', 7);

    const formatSelect = document.createElement('select');
    formatSelect.className = 'color-editor-format';
    formatSelect.innerHTML = '<option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option>';

    const btnWrap = document.createElement('div');
    btnWrap.className = 'color-editor-actions';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'color-editor-btn color-editor-btn-apply';
    applyBtn.textContent = 'Aplicar';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'color-editor-btn color-editor-btn-cancel';
    cancelBtn.textContent = 'Cerrar';

    const drag = (el, onMove) => {
      const move = (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        onMove(x, y);
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };

    hueRing.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = hueRing.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      h = (angle * 180 / Math.PI + 90 + 360) % 360;
      if (h < 0) h += 360;
      hueHandle.style.transform = `rotate(${h}deg)`;
      setHexFromHSL();
      const moveHue = (ev) => {
        const r = hueRing.getBoundingClientRect();
        const centerX = r.left + r.width / 2;
        const centerY = r.top + r.height / 2;
        const a = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
        h = (a * 180 / Math.PI + 90 + 360) % 360;
        if (h < 0) h += 360;
        hueHandle.style.transform = `rotate(${h}deg)`;
        setHexFromHSL();
      };
      const upHue = () => {
        document.removeEventListener('mousemove', moveHue);
        document.removeEventListener('mouseup', upHue);
      };
      document.addEventListener('mousemove', moveHue);
      document.addEventListener('mouseup', upHue);
    });

    slArea.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = slArea.getBoundingClientRect();
      s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      l = Math.max(0, Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100));
      setSLHandlePos();
      setHexFromHSL();
      drag(slArea, (x, y) => {
        s = Math.max(0, Math.min(100, x * 100));
        l = Math.max(0, Math.min(100, (1 - y) * 100));
        setSLHandlePos();
        setHexFromHSL();
      });
    });

    hexInput.addEventListener('input', () => {
      let v = hexInput.value.replace(/^#/, '').trim();
      if (/^[0-9A-Fa-f]{6}$/.test(v)) {
        const { h: nh, s: ns, l: nl } = this.hexToHSL(`#${v}`);
        h = nh; s = ns; l = nl;
        hueHandle.style.transform = `rotate(${h}deg)`;
        setSLHandlePos();
        slArea.style.background = `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
        previewEl.style.background = `#${v}`;
      }
    });

    formatSelect.addEventListener('change', () => {
      const hex = hexInput.value.replace(/^#/, '');
      if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return;
      const hexFull = `#${hex}`;
      const { h: hh, s: ss, l: ll } = this.hexToHSL(hexFull);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (formatSelect.value === 'rgb') hexInput.value = `rgb(${r}, ${g}, ${b})`;
      else if (formatSelect.value === 'hsl') hexInput.value = `hsl(${Math.round(hh)}, ${Math.round(ss)}%, ${Math.round(ll)}%)`;
      else hexInput.value = hex.toUpperCase();
    });

    applyBtn.addEventListener('click', applyColor);
    cancelBtn.addEventListener('click', closeEditor);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });

    wheelWrap.appendChild(hueRing);
    hueRing.appendChild(slArea);
    slArea.appendChild(slHandle);
    hueRing.appendChild(hueHandle);
    hexWrap.appendChild(hexInput);
    hexWrap.appendChild(formatSelect);
    btnWrap.appendChild(applyBtn);
    btnWrap.appendChild(cancelBtn);
    panel.appendChild(wheelWrap);
    panel.appendChild(previewEl);
    panel.appendChild(hexWrap);
    panel.appendChild(btnWrap);
    modal.appendChild(panel);
    container.appendChild(modal);
    hexInput.focus();
  }

  async updateColor(colorId, hexValue) {
    if (!this.supabase || !this.brandData) return;
    const hex = (hexValue || '').replace(/^#/, '').trim();
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return;
    try {
      const { error } = await this.supabase
        .from('brand_colors')
        .update({ hex_value: `#${hex}` })
        .eq('id', colorId);
      if (error) throw error;
      await this.loadData();
      this.renderCards();
      this.applyBrandBackgroundGradient(true);
    } catch (error) {
      console.error('❌ Error al actualizar color:', error);
      alert('Error al actualizar el color. Por favor, intenta de nuevo.');
    }
  }

  /** Elige un color_role que no esté ya usado (para respetar UNIQUE(brand_id, color_role)). */
  pickNextColorRole(existingColors) {
    const roleLabels = ['Color', 'Color 2', 'Color 3', 'Color 4'];
    const usedRoles = new Set((existingColors || []).map(c => (c.color_role || '').trim()));
    const next = roleLabels.find(r => !usedRoles.has(r));
    return next || `Color ${(existingColors || []).length + 1}`;
  }

  async createColor(hexValue) {
    if (!this.supabase || !this.brandData) return;
    const hex = (hexValue || '').replace(/^#/, '').trim();
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return;
    const existing = this.brandColors || [];
    if (existing.length >= 4) {
      alert('Máximo 4 colores por marca.');
      return;
    }
    const hexNorm = `#${hex}`.toLowerCase();
    const alreadyExists = existing.some(
      c => (c.hex_value || '').toLowerCase() === hexNorm
    );
    if (alreadyExists) {
      alert('Este color ya existe en la marca.');
      return;
    }
    // Refrescar colores desde BD por si hubo cambios (otra pestaña, etc.)
    const { data: freshColors } = await this.supabase
      .from('brand_colors')
      .select('id, color_role, hex_value')
      .eq('brand_id', this.brandData.id);
    const currentInDb = freshColors || [];
    if (currentInDb.length >= 4) {
      alert('Máximo 4 colores por marca.');
      return;
    }
    const colorRole = this.pickNextColorRole(currentInDb);
    try {
      const { error } = await this.supabase
        .from('brand_colors')
        .insert({
          brand_id: this.brandData.id,
          color_role: colorRole,
          hex_value: hexNorm
        });
      if (error) throw error;
      await this.loadData();
      this.renderCards();
      this.applyBrandBackgroundGradient(true);
    } catch (error) {
      const isDuplicate = (error?.code === '23505') || (error?.message || '').includes('duplicate key');
      console.error('❌ Error al crear color:', error);
      if (isDuplicate) {
        alert('Este color ya existe en la marca. Elige otro valor.');
      } else {
        alert('Error al agregar el color. Por favor, intenta de nuevo.');
      }
    }
  }

  /** Devuelve la fuente de tipografía actual (para imágenes) desde brand_rules. */
  getTypographyFontFamily() {
    const typographyRule = (this.brandRules || []).find(rule =>
      rule.rule_type === 'typography' ||
      (rule.rule_value && typeof rule.rule_value === 'object' && rule.rule_value.font_family)
    );
    if (!typographyRule) return 'Inter';
    const rv = typographyRule.rule_value || {};
    return rv.font_family || typographyRule.font_family || 'Inter';
  }

  /** Carga la fuente en el documento para la vista previa (Google Fonts). */
  loadFontForPreview(fontFamily) {
    if (!fontFamily || fontFamily === 'Inter') return; // Inter ya está en index.html
    const id = `font-preview-${fontFamily.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, '+')}:wght@400;600&display=swap`;
    document.head.appendChild(link);
  }

  /** Carga todas las fuentes del dropdown para que "AaBbCc" se vea bien en cada opción. */
  loadAllTypographyFonts() {
    BrandsView.TYPOGRAPHY_FONTS.forEach(f => this.loadFontForPreview(f.value));
  }

  renderTypography() {
    const container = (this.container && this.container.querySelector('#typographyPreview')) ||
                      document.getElementById('typographyPreview');
    if (!container) {
      if (!this._containerWarned.typographyPreview) {
        this._containerWarned.typographyPreview = true;
        console.warn('⚠️ typographyPreview no encontrado');
      }
      return;
    }
    const currentFont = this.getTypographyFontFamily();
    this.loadFontForPreview(currentFont);
    const fonts = BrandsView.TYPOGRAPHY_FONTS;
    const dropdownId = 'typographyFontDropdown';
    const panelId = 'typographyFontPanel';
    container.innerHTML = `
      <label class="typography-label">Tipografía para imágenes</label>
      <div class="typography-dropdown" id="${dropdownId}" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-label="Seleccionar tipografía para imágenes">
        <button type="button" class="typography-dropdown-trigger" aria-controls="${panelId}">
          <span class="typography-trigger-name">${this.escapeHtml(currentFont)}</span>
          <span class="typography-trigger-preview" style="font-family: '${this.escapeHtml(currentFont)}', sans-serif;">AaBbCc</span>
          <span class="typography-trigger-chevron" aria-hidden="true"></span>
        </button>
        <div class="typography-dropdown-panel" id="${panelId}" role="listbox" hidden>
          ${fonts.map(f => `
            <div class="typography-dropdown-option" role="option" data-value="${this.escapeHtml(f.value)}" ${f.value === currentFont ? 'aria-selected="true"' : ''}>
              <span class="typography-option-name">${this.escapeHtml(f.label)}</span>
              <span class="typography-option-preview" style="font-family: '${this.escapeHtml(f.value)}', sans-serif;">AaBbCc</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    const dropdown = container.querySelector(`#${dropdownId}`);
    const trigger = container.querySelector('.typography-dropdown-trigger');
    const panel = container.querySelector(`#${panelId}`);
    const options = container.querySelectorAll('.typography-dropdown-option');

    const closePanel = () => {
      if (panel) panel.setAttribute('hidden', '');
      if (dropdown) dropdown.setAttribute('aria-expanded', 'false');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (this._typographyOutsideClose) {
        document.removeEventListener('click', this._typographyOutsideClose);
        this._typographyOutsideClose = null;
      }
    };

    const selectFont = (fontValue) => {
      this.loadFontForPreview(fontValue);
      this.saveTypographyForImages(fontValue);
      this.renderTypography();
    };

    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel && !panel.hasAttribute('hidden');
        if (isOpen) {
          closePanel();
        } else {
          this.loadAllTypographyFonts();
          if (panel) panel.removeAttribute('hidden');
          if (dropdown) dropdown.setAttribute('aria-expanded', 'true');
          if (trigger) trigger.setAttribute('aria-expanded', 'true');
          this._typographyOutsideClose = (ev) => {
            if (dropdown && !dropdown.contains(ev.target)) closePanel();
          };
          document.addEventListener('click', this._typographyOutsideClose);
        }
      });
    }

    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = opt.getAttribute('data-value');
        if (value) selectFont(value);
        closePanel();
      });
    });
  }

  async saveTypographyForImages(fontFamily) {
    if (!this.supabase || !this.brandData?.id) return;
    const ruleValue = { font_family: fontFamily, font_weight: '400' };
    try {
      const { data: existing } = await this.supabase
        .from('brand_rules')
        .select('id')
        .eq('brand_id', this.brandData.id)
        .eq('rule_type', 'typography')
        .limit(1)
        .maybeSingle();
      if (existing) {
        await this.supabase
          .from('brand_rules')
          .update({ rule_value: ruleValue })
          .eq('id', existing.id);
      } else {
        await this.supabase
          .from('brand_rules')
          .insert({
            brand_id: this.brandData.id,
            rule_type: 'typography',
            rule_value: ruleValue
          });
      }
      const rules = (this.brandRules || []).map(r =>
        r.rule_type === 'typography' ? { ...r, rule_value: ruleValue } : r
      );
      if (!rules.some(r => r.rule_type === 'typography')) {
        rules.push({ rule_type: 'typography', rule_value: ruleValue });
      }
      this.brandRules = rules;
    } catch (e) {
      console.error('Error al guardar tipografía:', e);
      alert('No se pudo guardar la tipografía. Intenta de nuevo.');
    }
  }

  renderVisualStatus() {
    const container = (this.container && this.container.querySelector('#visualStatus')) ||
                      document.getElementById('visualStatus');
    if (!container) {
      if (!this._containerWarned.visualStatus) {
        this._containerWarned.visualStatus = true;
        console.warn('⚠️ visualStatus no encontrado');
      }
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
      if (!this._containerWarned.identityFilesContainer) {
        this._containerWarned.identityFilesContainer = true;
        console.warn('⚠️ identityFilesContainer no encontrado');
      }
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
    
    // Preparar infoCard para animación (antes de moverla)
    infoCard.style.willChange = 'opacity, transform, width, height';
    
    // Ocultar otras cards y nombre de marca con fade out suave
    otherCards.forEach((card, index) => {
      card.style.willChange = 'opacity, transform';
      card.style.transition = `opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.03}s, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.03}s`;
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px) scale(0.98)';
    });
    
    if (cornerInfo) {
      cornerInfo.style.willChange = 'opacity, transform';
      cornerInfo.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s';
      cornerInfo.style.opacity = '0';
      cornerInfo.style.transform = 'translateY(12px) scale(0.98)';
    }
    
    // Cambiar a modo secundario después de que las otras cards empiecen a desaparecer
    setTimeout(() => {
      dashboardContainer.classList.add('info-mode-secondary');
      dashboardContainer.classList.remove('info-expanded'); // Limpiar clase antigua si existe
      
      // Mover la card fuera del contenedor de cards al contenedor principal
      infoCard.classList.add('expanded');
      dashboardContainer.appendChild(infoCard);
      
      // Preparar estado inicial para animación suave
      requestAnimationFrame(() => {
        infoCard.style.opacity = '0';
        infoCard.style.transform = 'scale(0.96) translateY(15px)';
        infoCard.style.transition = 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s';
        
        // Animar entrada con doble requestAnimationFrame para suavidad
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            infoCard.style.opacity = '1';
            infoCard.style.transform = 'scale(1) translateY(0)';
          });
        });
      });
    }, 150); // Timing optimizado para mejor sincronización
  }

  closeInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoCard = container.querySelector('.card-info.expanded');
    if (!infoCard) return;
    
    if (!this.infoPanelState) return;
    
    const { dashboardContainer, cardsZone, otherCards, cornerInfo } = this.infoPanelState;
    
    // Animar contenido primero (fade out rápido)
    const content = infoCard.querySelector('.card-content-expanded');
    if (content) {
      content.style.transition = 'opacity 0.2s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
      content.style.opacity = '0';
    }
    
    // Preparar animación de salida suave de la card
    infoCard.style.willChange = 'opacity, transform';
    infoCard.style.transition = 'opacity 0.5s cubic-bezier(0.55, 0.055, 0.675, 0.19), transform 0.5s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
    
    // Animar salida con pequeño delay para que el contenido desaparezca primero
    setTimeout(() => {
      requestAnimationFrame(() => {
        infoCard.style.opacity = '0';
        infoCard.style.transform = 'scale(0.96) translateY(-15px)';
      });
    }, 100);
    
    // Esperar a que termine la animación de salida (incluyendo el delay del contenido)
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
      infoCard.style.willChange = '';
      
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
      
      // Pequeño delay para que el cambio de modo se aplique antes de mostrar otras cards
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Mostrar otras cards y nombre de marca con fade in escalonado
          if (otherCards && otherCards.length > 0) {
            otherCards.forEach((card, index) => {
              if (card.parentElement) {
                card.style.willChange = 'opacity, transform';
                card.style.transition = `opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${0.3 + index * 0.04}s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${0.3 + index * 0.04}s`;
                card.style.opacity = '1';
                card.style.transform = 'translateY(0) scale(1)';
              }
            });
          }
          
          if (cornerInfo && cornerInfo.parentElement) {
            cornerInfo.style.willChange = 'opacity, transform';
            cornerInfo.style.transition = 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.35s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.35s';
            cornerInfo.style.opacity = '1';
            cornerInfo.style.transform = 'translateY(0) scale(1)';
          }
          
          // Limpiar estilos después de la animación
          setTimeout(() => {
            if (otherCards) {
              otherCards.forEach(card => {
                card.style.transition = '';
                card.style.opacity = '';
                card.style.transform = '';
                card.style.willChange = '';
              });
            }
            
            if (cornerInfo) {
              cornerInfo.style.transition = '';
              cornerInfo.style.opacity = '';
              cornerInfo.style.transform = '';
              cornerInfo.style.willChange = '';
            }
            
            this.infoPanelState = null;
          }, 800); // Tiempo suficiente para todas las animaciones
        });
      });
    }, 500); // Tiempo de animación de salida (sincronizado con CSS)
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
      <!-- IDENTIDAD - Solo logo -->
      <section class="info-section info-section-identity">
        <div class="info-section-content">
          ${this.renderIdentitySection(brandContainer, brand)}
        </div>
      </section>

      <!-- ESENCIA (schema: objetivos_marca, nicho_mercado, arquetipo_personalidad, enfoque_marca) -->
      <section class="info-section">
        <h3 class="info-section-title">Esencia</h3>
        <div class="info-section-content">
          ${this.renderEssenceSection(brand)}
        </div>
      </section>

      <!-- LENGUAJE (schema: tono_voz, palabras_clave, palabras_prohibidas, tono_comunicacion, estilo_escritura) -->
      <section class="info-section">
        <h3 class="info-section-title">Lenguaje</h3>
        <div class="info-section-content">
          ${this.renderLanguageSection(brand)}
        </div>
      </section>

      <!-- ESTILO VISUAL (schema: estilo_visual, estilo_publicidad, transmitir_visualmente, evitar_visualmente) -->
      <section class="info-section">
        <h3 class="info-section-title">Estilo visual</h3>
        <div class="info-section-content">
          ${this.renderVisualStyleSection(brand)}
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

    this.setupInfoPanelEditables(container);
  }

  setupInfoPanelEditables(container) {
    if (!container) return;

    // Logo upload
    const logoInput = container.querySelector('.info-logo-container input[type="file"]');
    if (logoInput) {
      logoInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          this.uploadLogo(e.target.files[0]);
        }
      });
    }

    // Redes y web (dentro de INFO, junto al logo)
    const linksContainer = container.querySelector('#brandLinksContainer');
    if (linksContainer) {
      this.renderLinksInto(linksContainer);
    }

    // Campos de texto editables (schema: solo palabras_clave como texto que se convierte a array)
    container.querySelectorAll('.info-field-value').forEach(field => {
      const label = field.previousElementSibling;
      if (!label || !label.classList.contains('info-field-label')) return;
      const labelText = label.textContent.trim();
      if (labelText === 'Palabras a usar') {
        field.classList.add('info-editable');
        this.makeEditableText(field, 'palabras_clave', 'brand', () => {
          const infoCard = document.querySelector('.card-info.expanded');
          if (infoCard) {
            const content = infoCard.querySelector('.card-content-expanded');
            if (content) this.renderInfoPanelContent(content);
          }
        });
      }
    });

    // Objetivos y Palabras a evitar: siempre formato tags + input (estado 2 único)
    const onRefreshPanel = () => {
            const infoCard = document.querySelector('.card-info.expanded');
            if (infoCard) {
              const content = infoCard.querySelector('.card-content-expanded');
        if (content) this.renderInfoPanelContent(content);
      }
    };
    container.querySelectorAll('.info-field-value[data-multiselect]').forEach(wrap => {
      const fieldName = wrap.getAttribute('data-multiselect');
      const schemaField = wrap.getAttribute('data-field') || (fieldName === 'palabras_evitar' ? 'palabras_prohibidas' : fieldName);
      if (!fieldName) return;
      this.makeEditableMultiSelect(wrap, schemaField, [], 'brand', onRefreshPanel);
    });

    // Tono de voz: siempre dropdown (estado 2 único)
    const tonoVozWrap = container.querySelector('.info-field-value[data-select="tono_voz"]');
    if (tonoVozWrap) {
      const tonoOptions = [
        { value: 'formal', label: 'Formal' },
        { value: 'informal', label: 'Informal' },
        { value: 'profesional', label: 'Profesional' },
        { value: 'amigable', label: 'Amigable' },
        { value: 'técnico', label: 'Técnico' },
        { value: 'creativo', label: 'Creativo' },
        { value: 'empático', label: 'Empático' },
        { value: 'directo', label: 'Directo' }
      ];
      this.makeEditableSelect(tonoVozWrap, 'tono_voz', tonoOptions, 'brand', onRefreshPanel);
    }
  }

  renderIdentitySection(brandContainer, brand) {
    const logoUrl = brandContainer?.logo_url;
    const nombreMarca = brandContainer?.nombre_marca || 'Sin nombre';
    
    // Validar URL del logo antes de renderizar
    const isValidLogoUrl = logoUrl && 
      (logoUrl.startsWith('http://') || 
       logoUrl.startsWith('https://') || 
       logoUrl.startsWith('/'));
    
    return `
      <div class="info-identity-row">
        <div class="info-logo-container">
          ${isValidLogoUrl
            ? `<img src="${this.escapeHtml(logoUrl)}" alt="" class="info-logo-preview" onerror="this.style.display='none';var p=this.nextElementSibling;if(p)p.classList.add('visible');">`
            : ''
          }
          <div class="info-logo-placeholder ${isValidLogoUrl ? '' : 'visible'}"><i class="fas fa-image"></i></div>
          <input type="file" accept="image/*" class="info-logo-input" title="Subir logo">
        </div>
        <ul class="info-links-list" id="brandLinksContainer" aria-label="Redes y web"></ul>
      </div>
    `;
  }

  renderEssenceSection(brand) {
    if (!brand) {
      return '<p class="info-empty">No hay información de esencia disponible.</p>';
    }
    let html = '';
    html += `<div class="info-field"><div class="info-field-label">Objetivos</div><div class="info-field-value" data-multiselect="objetivos_marca" data-field="objetivos_marca"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Nicho de mercado</div><div class="info-field-value" data-multiselect="nicho_mercado" data-field="nicho_mercado"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Arquetipo / personalidad</div><div class="info-field-value" data-multiselect="arquetipo_personalidad" data-field="arquetipo_personalidad"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Enfoque de marca</div><div class="info-field-value" data-multiselect="enfoque_marca" data-field="enfoque_marca"></div></div>`;
    return html;
  }

  renderLanguageSection(brand) {
    if (!brand) {
      return '<p class="info-empty">No hay información de lenguaje disponible.</p>';
    }
    const palabrasClave = brand.palabras_clave;
    const palabrasClaveStr = Array.isArray(palabrasClave) ? palabrasClave.join(', ') : (palabrasClave || '');
    let html = '';
    html += `<div class="info-field"><div class="info-field-label">Tono de voz</div><div class="info-field-value" data-select="tono_voz"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Palabras a usar</div><div class="info-field-value">${this.escapeHtml(palabrasClaveStr)}</div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Palabras a evitar</div><div class="info-field-value" data-multiselect="palabras_evitar" data-field="palabras_prohibidas"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Tono de comunicación</div><div class="info-field-value" data-multiselect="tono_comunicacion" data-field="tono_comunicacion"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Estilo de escritura</div><div class="info-field-value" data-multiselect="estilo_escritura" data-field="estilo_escritura"></div></div>`;
    return html;
  }

  /**
   * Sección Estilo visual (schema: estilo_visual, estilo_publicidad, transmitir_visualmente, evitar_visualmente)
   */
  renderVisualStyleSection(brand) {
    if (!brand) {
      return '<p class="info-empty">No hay información de estilo visual.</p>';
    }
    let html = '';
    html += `<div class="info-field"><div class="info-field-label">Estilo visual</div><div class="info-field-value" data-multiselect="estilo_visual" data-field="estilo_visual"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Estilo publicidad</div><div class="info-field-value" data-multiselect="estilo_publicidad" data-field="estilo_publicidad"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Transmitir visualmente</div><div class="info-field-value" data-multiselect="transmitir_visualmente" data-field="transmitir_visualmente"></div></div>`;
    html += `<div class="info-field"><div class="info-field-label">Evitar visualmente</div><div class="info-field-value" data-multiselect="evitar_visualmente" data-field="evitar_visualmente"></div></div>`;
    return html;
  }

  renderCreativeRulesSection(brand, rulesByType) {
    const hasRules = Object.keys(rulesByType).length > 0;
    if (!hasRules) {
      return '<p class="info-empty">No hay reglas creativas definidas.</p>';
    }
    let html = '';
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

  // ============================================
  // MÉTODOS DE GUARDADO
  // ============================================

  async saveContainerField(fieldName, value) {
    if (!this.supabase || !this.brandContainerData) return;

    const saveKey = `container_${fieldName}`;
    if (this.savingFields.has(saveKey)) {
      console.log(`⏳ Guardado de ${fieldName} ya en curso`);
      return;
    }

    this.savingFields.add(saveKey);

    try {
      const { error } = await this.supabase
        .from('brand_containers')
        .update({ [fieldName]: value || null, updated_at: new Date().toISOString() })
        .eq('id', this.brandContainerData.id);

      if (error) throw error;

      this.brandContainerData[fieldName] = value || null;
      console.log(`✅ ${fieldName} actualizado correctamente`);
    } catch (error) {
      console.error(`❌ Error al guardar ${fieldName}:`, error);
      alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  async saveBrandField(fieldName, value) {
    if (!this.supabase || !this.brandData) {
      // Si no existe brand, crearlo
      if (!this.brandContainerData) return;
      
      try {
        const { data: newBrand, error } = await this.supabase
          .from('brands')
          .insert({
            project_id: this.brandContainerData.id,
            [fieldName]: value || null,
            tono_voz: 'formal' // Valor por defecto requerido
          })
          .select()
          .single();

        if (error) throw error;
        this.brandData = newBrand;
        console.log(`✅ Brand creado y ${fieldName} guardado`);
        return;
      } catch (error) {
        console.error(`❌ Error al crear brand:`, error);
        alert(`Error al crear brand. Por favor, intenta de nuevo.`);
        return;
      }
    }

    const saveKey = `brand_${fieldName}`;
    if (this.savingFields.has(saveKey)) {
      console.log(`⏳ Guardado de ${fieldName} ya en curso`);
      return;
    }

    this.savingFields.add(saveKey);

    const brandArrayFields = ['objetivos_marca', 'nicho_mercado', 'arquetipo_personalidad', 'enfoque_marca', 'estilo_visual', 'estilo_publicidad', 'transmitir_visualmente', 'evitar_visualmente', 'tono_comunicacion', 'estilo_escritura', 'palabras_clave', 'palabras_prohibidas'];
    let payloadValue = value;
    if (fieldName === 'palabras_clave' && typeof value === 'string') {
      payloadValue = value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    const isEmpty = payloadValue === '' || (Array.isArray(payloadValue) && payloadValue.length === 0);
    if (isEmpty) {
      payloadValue = brandArrayFields.includes(fieldName) ? [] : null;
    }

    try {
      const { error } = await this.supabase
        .from('brands')
        .update({ [fieldName]: payloadValue, updated_at: new Date().toISOString() })
        .eq('id', this.brandData.id);

      if (error) throw error;

      this.brandData[fieldName] = payloadValue;
      console.log(`✅ ${fieldName} actualizado correctamente`);
    } catch (error) {
      console.error(`❌ Error al guardar ${fieldName}:`, error);
      alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  async deleteColor(colorId) {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('brand_colors')
        .delete()
        .eq('id', colorId);

      if (error) throw error;

      // Recargar colores y actualizar degradado de fondo
      await this.loadData();
      this.renderCards();
      this.applyBrandBackgroundGradient(true);
      console.log(`✅ Color eliminado`);
    } catch (error) {
      console.error(`❌ Error al eliminar color:`, error);
      alert(`Error al eliminar color. Por favor, intenta de nuevo.`);
    }
  }

  async uploadLogo(file) {
    if (!file || !this.brandContainerData) return;
    if (!this.supabase && window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    }
    if (!this.supabase) {
      alert('No se pudo conectar. Intenta de nuevo.');
      return;
    }
    const container = this.container || document.getElementById('app-container');
    const logoWrap = container?.querySelector('.info-logo-container');
    if (logoWrap) {
      logoWrap.style.pointerEvents = 'none';
      logoWrap.style.opacity = '0.7';
    }
    try {
      const fileExt = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `logo_${this.brandContainerData.id}_${Date.now()}.${fileExt}`;
      const filePath = `${this.brandContainerData.id}/${fileName}`;
      const bucket = 'brand-logos';

      const { error: uploadError } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      await this.saveContainerField('logo_url', publicUrl);
      this.brandContainerData.logo_url = publicUrl;
      await this.loadData();
      this.renderAll();
      // Actualizar el panel INFO si está abierto para que se vea el nuevo logo
      const container = this.container || document.getElementById('app-container');
      const infoCard = container?.querySelector('.card-info.expanded');
      if (infoCard) {
        const content = infoCard.querySelector('.card-content-expanded');
        if (content) this.renderInfoPanelContent(content);
      }
      const logoInput = container?.querySelector('.info-logo-container input[type="file"]');
      if (logoInput) logoInput.value = '';
      console.log(`✅ Logo subido correctamente`);
    } catch (error) {
      console.error(`❌ Error al subir logo:`, error);
      alert(`Error al subir logo. Por favor, intenta de nuevo.`);
    } finally {
      if (logoWrap) {
        logoWrap.style.pointerEvents = '';
        logoWrap.style.opacity = '';
      }
    }
  }

  async uploadAsset(file) {
    if (!this.supabase || !this.brandContainerData) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `asset_${this.brandContainerData.id}_${Date.now()}.${fileExt}`;
      const filePath = `brands/${this.brandContainerData.id}/assets/${fileName}`;

      const { error: uploadError } = await this.supabase.storage
        .from('brand-core')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = this.supabase.storage
        .from('brand-core')
        .getPublicUrl(filePath);

      // Crear registro en brand_assets
      const { error: insertError } = await this.supabase
        .from('brand_assets')
        .insert({
          brand_container_id: this.brandContainerData.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size
        });

      if (insertError) throw insertError;

      await this.loadData();
      this.renderCards();
      console.log(`✅ Archivo subido correctamente`);
    } catch (error) {
      console.error(`❌ Error al subir archivo:`, error);
      alert(`Error al subir archivo. Por favor, intenta de nuevo.`);
    }
  }

  // ============================================
  // MÉTODOS DE EDICIÓN INLINE
  // ============================================

  makeEditableText(element, fieldName, table = 'container', onSave = null) {
    if (!element) return;

    // Aplicar estilos sin transiciones usando función común de BaseView
    element.style.cursor = 'text';
    this.applyNoTransitionStyles(element);
    
    element.setAttribute('contenteditable', 'true');
    element.classList.add('editable-field');
    
    // Agregar listeners para prevenir efectos hover usando función común
    this.addNoHoverListeners(element);

    element.addEventListener('blur', async () => {
      const value = element.textContent.trim();
      const originalValue = table === 'container' 
        ? (this.brandContainerData?.[fieldName] || '')
        : (this.brandData?.[fieldName] || '');

      if (value !== originalValue) {
        if (table === 'container') {
          await this.saveContainerField(fieldName, value);
          this.renderBrandName();
        } else {
          await this.saveBrandField(fieldName, value);
        }
        if (onSave) onSave();
      }
    });

    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        element.blur();
      }
    });
  }

  makeEditableTextarea(element, fieldName, table = 'brand', onSave = null) {
    if (!element) return;

    const originalValue = table === 'container' 
      ? (this.brandContainerData?.[fieldName] || '')
      : (this.brandData?.[fieldName] || '');

    const textarea = document.createElement('textarea');
    textarea.value = originalValue;
    textarea.className = 'editable-textarea';
    textarea.style.width = '100%';
    textarea.style.minHeight = '80px';
    textarea.style.padding = '0.5rem';
    textarea.style.background = 'rgba(255, 255, 255, 0.05)';
    textarea.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    textarea.style.borderRadius = '6px';
    textarea.style.color = 'var(--text-primary, #F2F3F5)';
    textarea.style.fontSize = '0.875rem';
    textarea.style.fontFamily = 'inherit';
    textarea.style.resize = 'vertical';

    element.innerHTML = '';
    element.appendChild(textarea);

    textarea.addEventListener('blur', async () => {
      const value = textarea.value.trim();
      if (value !== originalValue) {
        if (table === 'container') {
          await this.saveContainerField(fieldName, value);
        } else {
          await this.saveBrandField(fieldName, value);
        }
        if (onSave) onSave();
        // Restaurar visualización
        element.innerHTML = value || '<span style="opacity: 0.5;">Sin contenido</span>';
        this.makeEditableTextarea(element, fieldName, table, onSave);
      } else {
        element.innerHTML = originalValue || '<span style="opacity: 0.5;">Sin contenido</span>';
        this.makeEditableTextarea(element, fieldName, table, onSave);
      }
    });

    textarea.focus();
  }

  makeEditableSelect(element, fieldName, options, table = 'brand', onSave = null) {
    if (!element) return;

    const originalValue = table === 'container' 
      ? (this.brandContainerData?.[fieldName] || '')
      : (this.brandData?.[fieldName] || '');

    const select = document.createElement('select');
    select.className = 'editable-select';
    select.style.width = '100%';

    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === originalValue) option.selected = true;
      select.appendChild(option);
    });

    element.innerHTML = '';
    element.appendChild(select);

    select.addEventListener('change', async () => {
      const value = select.value;
      if (value !== originalValue) {
        if (table === 'container') {
          await this.saveContainerField(fieldName, value);
        } else {
          await this.saveBrandField(fieldName, value);
        }
        if (onSave) onSave();
      }
    });
  }

  makeEditableMultiSelect(element, fieldName, allOptions, table = 'container', onSave = null) {
    if (!element) return;

    const originalValue = table === 'container' 
      ? (this.brandContainerData?.[fieldName] || [])
      : (this.brandData?.[fieldName] || []);
    
    const currentValues = Array.isArray(originalValue) ? originalValue : [];

    // Crear contenedor de tags
    const container = document.createElement('div');
    container.className = 'editable-multiselect';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '0.5rem';

    // Renderizar tags actuales
    currentValues.forEach(val => {
      const tag = document.createElement('span');
      tag.className = 'editable-tag';
      tag.textContent = val;
      tag.style.padding = '0.25rem 0.5rem';
      tag.style.background = 'rgba(212, 184, 150, 0.2)';
      tag.style.border = '1px solid rgba(212, 184, 150, 0.3)';
      tag.style.borderRadius = '4px';
      tag.style.fontSize = '0.75rem';
      tag.style.color = 'var(--brand-text-gold, #D4B896)';
      tag.style.cursor = 'pointer';
      tag.style.position = 'relative';

      const removeBtn = document.createElement('span');
      removeBtn.innerHTML = ' ×';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.marginLeft = '0.25rem';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newValues = currentValues.filter(v => v !== val);
        this.saveMultiSelect(fieldName, newValues, table, onSave);
      });

      tag.appendChild(removeBtn);
      container.appendChild(tag);
    });

    // Input para agregar nuevos
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'editable-tag-input';
    input.placeholder = '+ Agregar';
    input.style.minWidth = '80px';
    input.style.flex = '1';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        const newValue = input.value.trim();
        if (!currentValues.includes(newValue)) {
          currentValues.push(newValue);
          this.saveMultiSelect(fieldName, currentValues, table, onSave);
        }
        input.value = '';
      }
    });

    container.appendChild(input);
    element.innerHTML = '';
    element.appendChild(container);
  }

  async saveMultiSelect(fieldName, values, table, onSave) {
    if (table === 'container') {
      await this.saveContainerField(fieldName, values);
      this.renderMarket();
    } else {
      await this.saveBrandField(fieldName, values);
    }
    if (onSave) onSave();
    // Re-renderizar
    const element = document.querySelector(`[data-field="${fieldName}"]`);
    if (element) {
      this.makeEditableMultiSelect(element, fieldName, [], table, onSave);
    }
  }

  setupFileUpload() {
    const container = document.getElementById('identityFilesContainer');
    if (!container) return;

    // Agregar botón de upload si no existe
    let uploadBtn = container.querySelector('.file-upload-btn');
    if (!uploadBtn) {
      uploadBtn = document.createElement('button');
      uploadBtn.className = 'file-upload-btn';
      uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Subir archivo';
      uploadBtn.style.marginTop = '1rem';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.multiple = true;
      fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
          this.uploadAsset(file);
        });
        fileInput.value = '';
      });

      uploadBtn.addEventListener('click', () => fileInput.click());
      container.appendChild(fileInput);
      container.appendChild(uploadBtn);
    }
  }
}

window.BrandsView = BrandsView;
