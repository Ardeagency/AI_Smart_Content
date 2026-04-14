/**
 * BrandOrganizationView — Identidad de marca a nivel workspace (`organizations`).
 * Sin `brand_containers`; sin card de entidades. Hereda la UX premium del antiguo BrandsView.
 */
class BrandOrganizationView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.brandContainerData = null;
    this.brandData = null;
    this.products = [];
    this.brandColors = [];
    this.brandFonts = [];
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
    /** @type {object|null} Fila `organizations` del workspace activo */
    this.organizationRow = null;
  }

  _mergeOrgIntoShim() {
    const org = this.organizationRow;
    if (!org) {
      this.brandContainerData = null;
      this.brandData = null;
      return;
    }
    const displayName = (org.brand_name_oficial || org.name || '').trim();
    this.brandContainerData = {
      id: org.id,
      organization_id: org.id,
      nombre_marca: displayName,
      logo_url: org.logo_url || null,
      mercado_objetivo: []
    };
    this.brandData = {
      name: org.name,
      brand_name_oficial: org.brand_name_oficial,
      brand_slogan: org.brand_slogan,
      level_of_autonomy: org.level_of_autonomy
    };
  }

  async _patchOrganization(partial) {
    const orgId = this.organizationRow?.id || window.currentOrgId;
    if (!this.supabase || !orgId || !partial || typeof partial !== 'object') return;
    const { error } = await this.supabase.from('organizations').update(partial).eq('id', orgId);
    if (error) throw error;
    this.organizationRow = { ...this.organizationRow, ...partial };
    this._mergeOrgIntoShim();
  }

  renderHTML() {
    return `
<!-- Brands Dashboard - Diseño Premium. Inicio fluido con animaciones suaves. -->
<div class="brand-dashboard-container" id="brandsListContainer">

    <!-- Fondo: skeleton visible hasta que carguen datos; luego crossfade al gradiente de marca -->
    <div class="brand-dashboard-background">
        <div class="background-skeleton" id="backgroundSkeleton" aria-hidden="true"></div>
        <div class="background-gradient" id="backgroundGradient"></div>
    </div>

    <!-- Footer: MARCA + Mercado -->
    <div class="brand-corner-bottom-left">
        <div class="brand-main-info">
            <div class="brand-name-row">
                <h1 class="brand-name-large" id="brandNameLarge"></h1>
                <div class="brand-status-indicator"><span class="status-dot"></span></div>
            </div>
        </div>
        <div class="brand-market-row">
            <span class="market-label" id="brandMarketLabel"></span>
        </div>
    </div>

    <!-- Cards a la derecha -->
    <div class="brand-cards-zone">

        <!-- INFO - Solo botón expandir -->
        <div class="brand-card card-info">
            <div class="card-header">
                <h2 class="card-title">INFO</h2>
                <span class="card-arrow"><i class="fas fa-arrow-right"></i></span>
            </div>
        </div>

        <!-- Visual de marca -->
        <div class="brand-card card-concept">
                <div class="card-header">
                <h2 class="card-title">Visual de marca</h2>
                </div>
                <div class="card-content">
                <!-- Brand Colors -->
                <div class="visual-section">
                    <div class="visual-section-label">Brand Colors</div>
                    <div class="color-swatches" id="brandColorSwatches">
                        <!-- Se renderizarán dinámicamente -->
            </div>
        </div>

                <!-- Typography System -->
                <div class="visual-section">
                    <div class="visual-section-label">Typography System</div>
                    <div class="typography-preview" id="typographyPreview">
                        <!-- Se renderizará dinámicamente -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Archivos de identidad -->
        <div class="brand-card card-identity">
            <div class="card-header">
                <h2 class="card-title">Archivos de identidad</h2>
            </div>
            <div class="card-content">
                <!-- Archivos -->
                <div class="identity-files" id="identityFilesContainer">
                    <!-- Se renderizarán dinámicamente -->
                </div>
            </div>
        </div>

    </div>

</div>
    `;
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
    // resetBrandPrimaryBrillo ya no toca --brand-gradient-dynamic (lo gestiona OrgBrandTheme),
    // por lo que la llamada aquí solo limpia --brand-primary* y no afecta otras vistas.
    this.resetBrandPrimaryBrillo();
    if (window.currentOrgId && window.OrgBrandTheme && typeof window.OrgBrandTheme.applyOrgBrandTheme === 'function') {
      window.OrgBrandTheme.applyOrgBrandTheme(window.currentOrgId);
    }
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

    // Si el contenedor no existe (render parcial o DOM inesperado), no intentar renderAll
    const brandsRoot = container.querySelector('#brandsListContainer');
    if (!brandsRoot) {
      if (!this._containerWarned.template) {
        this._containerWarned.template = true;
        console.warn('⚠️ Vista Marcas: #brandsListContainer no está en el DOM; renderHTML() no se aplicó correctamente.');
      }
      return;
    }

    const checkContainers = () => {
      if (!this.isActive) return false;
      const brandColorsEl = container.querySelector('#brandColorSwatches') || document.getElementById('brandColorSwatches');
      const typographyEl = container.querySelector('#typographyPreview') || document.getElementById('typographyPreview');
      if (brandColorsEl && typographyEl) {
        // Primer render inmediato con lo que haya (puede ser vacío)
        this.renderAll();
        const root = container.querySelector('#brandsListContainer');
        if (root) root.classList.add('brands-ready');
        (async () => {
          await this.ensureDataLoaded();
          if (!this.isActive) return;
          // Re-renderizar con datos reales una vez que cargaron
          this.renderAll();
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
    const name =
      (this.organizationRow?.brand_name_oficial || this.organizationRow?.name || 'Marca').trim();
    this.updateHeaderContext('Marca', name);
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
   * Carga `organizations` del workspace, activos/productos por `organization_id`, colores/fuentes y datos org.
   */
  async loadData() {
    if (!this.supabase || !this.userId) {
      this._dataLoaded = true;
      return;
    }

    try {
      const orgId = typeof window !== 'undefined' ? window.currentOrgId : null;
      if (!orgId) {
        this.organizationRow = null;
        this.brandContainerData = null;
        this.brandData = null;
        this.products = [];
        this.brandAssets = [];
        this.brandEntities = [];
        this.brandPlaces = [];
        this.brandAudiences = [];
        this.organizationMembers = [];
        this.organizationCredits = { credits_available: 100 };
        this.creditUsage = [];
        this.brandColors = [];
        this.brandFonts = [];
        this._dataLoaded = true;
        if (this.isActive) this._refreshInfoPanelIfOpen();
        return;
      }

      const { data: org, error: orgErr } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();

      if (orgErr && orgErr.code !== 'PGRST116') {
        console.warn('BrandOrganizationView: error cargando organizations', orgErr);
      }

      if (!org) {
        this.organizationRow = null;
        this.brandContainerData = null;
        this.brandData = null;
        this.products = [];
        this.brandAssets = [];
        this.brandEntities = [];
        this.brandPlaces = [];
        this.brandAudiences = [];
        this.organizationMembers = [];
        this.organizationCredits = { credits_available: 100 };
        this.creditUsage = [];
        this.brandColors = [];
        this.brandFonts = [];
        this._dataLoaded = true;
        if (this.isActive) this._refreshInfoPanelIfOpen();
        return;
      }

      this.organizationRow = org;
      this._mergeOrgIntoShim();

      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .limit(5);
      if (productsError) {
        console.warn('BrandOrganizationView: productos', productsError);
        this.products = [];
      } else {
        this.products = products || [];
      }

      const { data: assets, error: assetsError } = await this.supabase
        .from('brand_assets')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(12);
      if (assetsError) {
        console.warn('BrandOrganizationView: brand_assets', assetsError);
        this.brandAssets = [];
      } else {
        this.brandAssets = assets || [];
      }

      this.brandEntities = [];
      this.brandPlaces = [];
      this.brandAudiences = [];
      this.brandColors = await this._queryBrandColorsRows();
      this.brandFonts = await this._queryBrandFontsRows();
      this.brandRules = [];

      try {
        const [membersResult, creditsResult, usageResult] = await Promise.allSettled([
          this.supabase
            .from('organization_members')
            .select('*, profiles(id, full_name, email)')
            .eq('organization_id', orgId)
            .limit(5),
          this.supabase.from('organization_credits').select('*').eq('organization_id', orgId).maybeSingle(),
          this.supabase.from('credit_usage').select('*').eq('organization_id', orgId).limit(10)
        ]);

        if (membersResult.status === 'fulfilled' && !membersResult.value.error) {
          this.organizationMembers = membersResult.value.data || [];
        } else {
          const { data: membersSimple } = await this.supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', orgId)
            .limit(5);
          this.organizationMembers = (membersSimple || []).map((m) => ({ ...m, profiles: null }));
        }

        if (creditsResult.status === 'fulfilled' && !creditsResult.value.error) {
          this.organizationCredits = creditsResult.value.data || { credits_available: 100 };
        } else {
          this.organizationCredits = { credits_available: 100 };
        }

        if (usageResult.status === 'fulfilled' && !usageResult.value.error) {
          this.creditUsage = usageResult.value.data || [];
        } else {
          this.creditUsage = [];
        }
      } catch (e) {
        console.warn('BrandOrganizationView: datos org secundarios', e);
        this.organizationMembers = [];
        this.organizationCredits = { credits_available: 100 };
        this.creditUsage = [];
      }
    } catch (error) {
      console.error('BrandOrganizationView loadData:', error);
    } finally {
      this._dataLoaded = true;
      if (this.isActive) this._refreshInfoPanelIfOpen();
    }
  }

  async ensureDataLoaded() {
    if (this._dataLoaded) return;
    await this.loadData();
  }

  /**
   * Filas de brand_colors por organization_id.
   */
  async _queryBrandColorsRows() {
    const orgId = this.brandContainerData?.organization_id;
    if (!this.supabase || !orgId) return [];
    const { data, error } = await this.supabase
      .from('brand_colors')
      .select('*')
      .eq('organization_id', orgId);
    if (error) {
      console.warn('⚠️ Error cargando colores:', error);
      return [];
    }
    return data || [];
  }

  /** Filas de brand_fonts por organization_id. */
  async _queryBrandFontsRows() {
    const orgId = this.brandContainerData?.organization_id;
    if (!this.supabase || !orgId) return [];
    const { data, error } = await this.supabase
      .from('brand_fonts')
      .select('*')
      .eq('organization_id', orgId);
    if (error) {
      console.warn('⚠️ Error cargando fuentes:', error);
      return [];
    }
    return data || [];
  }

  /** Recarga solo brand_colors desde Supabase (evita recargar todo loadData en operaciones de color). */
  async _reloadColors() {
    if (!this.supabase || !this.brandContainerData?.organization_id) return;
    this.brandColors = await this._queryBrandColorsRows();
  }

  /** Recarga solo brand_assets desde Supabase (evita recargar todo loadData al subir archivos). */
  async _reloadAssets() {
    const orgId = this.organizationRow?.id;
    if (!this.supabase || !orgId) return;
    const { data } = await this.supabase
      .from('brand_assets')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(12);
    this.brandAssets = data || [];
  }

  /** Opciones del desplegable `nicho_core` (valor guardado = `value`). */
  static NICHO_CORE_OPTIONS = [
    { value: '', label: 'Seleccionar nicho' },
    { value: 'tecnologia_saas', label: 'Tecnología / SaaS' },
    { value: 'ecommerce_retail', label: 'E-commerce / Retail' },
    { value: 'salud_bienestar', label: 'Salud y bienestar' },
    { value: 'fitness_deporte', label: 'Fitness y deporte' },
    { value: 'alimentacion', label: 'Alimentación y gastronomía' },
    { value: 'educacion', label: 'Educación y formación' },
    { value: 'inmobiliaria', label: 'Inmobiliaria' },
    { value: 'servicios_profesionales', label: 'Servicios profesionales' },
    { value: 'marketing_agencia', label: 'Marketing y agencias' },
    { value: 'entretenimiento', label: 'Entretenimiento y medios' },
    { value: 'moda_belleza', label: 'Moda y belleza' },
    { value: 'turismo', label: 'Turismo y hospitalidad' },
    { value: 'finanzas', label: 'Finanzas y seguros' },
    { value: 'industrial_b2b', label: 'Industrial / B2B' },
    { value: 'sostenibilidad', label: 'Sostenibilidad e impacto' },
    { value: 'arte_cultura', label: 'Arte y cultura' },
    { value: 'hogar_lifestyle', label: 'Hogar y lifestyle' },
    { value: 'otro', label: 'Otro' }
  ];

  static getNichoCoreLabel(storedValue) {
    const v = storedValue == null ? '' : String(storedValue);
    const row = BrandOrganizationView.NICHO_CORE_OPTIONS.find((o) => o.value === v);
    if (row) return row.label;
    return v.trim() ? v : 'Seleccionar nicho';
  }

  /** Esquema `public.brands` (panel INFO derecho): orden y tipo de editor. */
  static BRAND_SCHEMA_BLOCKS = [
    { field: 'nicho_core', label: 'Nicho core', type: 'select' },
    { field: 'sub_nichos', label: 'Sub-nichos', type: 'array' },
    { field: 'arquetipo', label: 'Arquetipo', type: 'text' },
    { field: 'propuesta_valor', label: 'Propuesta de valor', type: 'textarea' },
    { field: 'mision_vision', label: 'Misión y visión', type: 'textarea' },
    { field: 'verbal_dna', label: 'ADN verbal (JSON)', type: 'json' },
    { field: 'visual_dna', label: 'ADN visual (JSON)', type: 'json' },
    { field: 'palabras_clave', label: 'Palabras clave', type: 'array' },
    { field: 'palabras_prohibidas', label: 'Palabras prohibidas', type: 'array' },
    { field: 'objetivos_estrategicos', label: 'Objetivos estratégicos', type: 'array' }
  ];

  static get BRAND_ARRAY_FIELDS() {
    return BrandOrganizationView.BRAND_SCHEMA_BLOCKS.filter((b) => b.type === 'array').map((b) => b.field);
  }

  static get BRAND_JSON_FIELDS() {
    return BrandOrganizationView.BRAND_SCHEMA_BLOCKS.filter((b) => b.type === 'json').map((b) => b.field);
  }

  static get BRAND_TEXT_FIELDS() {
    return BrandOrganizationView.BRAND_SCHEMA_BLOCKS.filter((b) => b.type === 'text').map((b) => b.field);
  }

  static get BRAND_TEXTAREA_FIELDS() {
    return BrandOrganizationView.BRAND_SCHEMA_BLOCKS.filter((b) => b.type === 'textarea').map((b) => b.field);
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
   * @param {string[]} hexes - Array de hex (#rrggbb)
   * @param {number} [angle=135] - Ángulo del gradiente en grados (135 = fondo, 180 = vertical para barras nav)
   */
  buildBrandGradientCss(hexes, angle = 135) {
    if (!hexes || hexes.length === 0) return '';
    const alpha = angle === 180 ? 1 : 0.88; // barras nav opacas; fondo algo transparente
    const stops = hexes.map((hex, i) => {
      const pct = hexes.length === 1 ? 100 : (i / (hexes.length - 1)) * 100;
      return `${this.hexToRgba(hex, alpha)} ${Math.round(pct)}%`;
    });
    return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
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
    const root = document.documentElement;
    if (hexes.length) {
      const brandGradient = this.buildBrandGradientCss(hexes);
      gradientEl.style.background = `${brandGradient}, ${neutralBg}`;
      gradientEl.setAttribute('data-brand-gradient', 'true');
      root.style.setProperty('--brand-gradient-dynamic', brandGradient);
      root.style.setProperty('--brand-gradient-dynamic-vertical', this.buildBrandGradientCss(hexes, 180));
      this.applyBrandPrimaryBrillo();
    } else {
      gradientEl.style.background = neutralBg;
      gradientEl.removeAttribute('data-brand-gradient');
      // NO borrar --brand-gradient-dynamic* aquí: esas vars las gestiona OrgBrandTheme
      // para toda la plataforma. Solo reseteamos el elemento visual y los vars de brillo.
      this.resetBrandPrimaryBrillo();
    }
    this.applyBrandCardsGlassVariant();
  }

  /**
   * Decide qué variante de glass usar en las cards de Brand:
   * - Fondo muy oscuro: usar glass-white para subir contraste.
   * - Muy claro/saturado o mixto/neutro: usar glass-black.
   */
  getBrandCardsGlassMode() {
    const hexes = this.getBrandColorsHexArray();
    if (!hexes.length) return 'black';
    const hslColors = hexes.map((hex) => this.hexToHSL(hex));
    const count = hslColors.length;
    const avgL = hslColors.reduce((acc, c) => acc + c.l, 0) / count;
    const darkCount = hslColors.filter((c) => c.l <= 35).length;
    const darkRatio = darkCount / count;

    const isVeryDarkPalette = avgL <= 38 && darkRatio >= 0.7;
    if (isVeryDarkPalette) return 'white';
    return 'black';
  }

  /** Aplica una clase al contenedor para que CSS pinte glass-white o glass-black en las cards. */
  applyBrandCardsGlassVariant() {
    const container = this.container || document.getElementById('app-container');
    const brandsRoot = (container && container.querySelector('#brandsListContainer')) || document.getElementById('brandsListContainer');
    if (!brandsRoot) return;
    const mode = this.getBrandCardsGlassMode();
    brandsRoot.classList.remove('brand-cards-glass-black', 'brand-cards-glass-white');
    brandsRoot.classList.add(mode === 'white' ? 'brand-cards-glass-white' : 'brand-cards-glass-black');
  }

  /** Pone en :root el color principal de la marca para hover/selected (brillo). */
  applyBrandPrimaryBrillo() {
    const hexes = this.getBrandColorsHexArray();
    if (!hexes.length) {
      this.resetBrandPrimaryBrillo();
      return;
    }
    const palette = this.getBrandUIPalette(hexes);
    if (!palette || !palette.primary) {
      this.resetBrandPrimaryBrillo();
      return;
    }
    const hex = palette.primary.replace(/^#/, '');
    if (hex.length !== 6) return;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', palette.primary);
    root.style.setProperty('--brand-primary-rgb', `${r},${g},${b}`);
    root.style.setProperty('--brand-primary-brillo', this.hexToRgba(palette.primary, 0.12));
    root.style.setProperty('--brand-primary-brillo-strong', this.hexToRgba(palette.primary, 0.18));
  }

  /** Vuelve al brillo por defecto (cuando no hay marca o se sale de brands).
   *  SOLO borra las vars --brand-primary*; las vars --brand-gradient-dynamic* las gestiona
   *  exclusivamente OrgBrandTheme para no borrar el tema de toda la plataforma. */
  resetBrandPrimaryBrillo() {
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-primary-rgb');
    root.style.removeProperty('--brand-primary-brillo');
    root.style.removeProperty('--brand-primary-brillo-strong');
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

  renderMarket() {
    const el = document.getElementById('brandMarketLabel');
    if (!el) return;
    el.removeAttribute('data-field');
    el.textContent = 'Workspace · identidad organizacional';
    el.style.cursor = 'default';
    el.style.opacity = '0.72';
  }

  renderCards() {
    this.applyBrandBackgroundGradient();
    this.renderBrandColors();
    this.renderTypography();
    this.renderIdentityFiles();
    this.setupFileUpload();
    this.setupEventListeners();
  }

  renderBrandEntities() {
    const container = (this.container && this.container.querySelector('#brandEntitiesList')) ||
                      document.getElementById('brandEntitiesList');
    if (!container) return;

    const entities = this.brandEntities || [];
    if (!entities.length) {
      container.innerHTML = '<p class="entities-empty">Sin entidades. Agrega productos o servicios como entidades de marca.</p>';
    } else {
      container.innerHTML = entities.map(e => {
        const places = (this.brandPlaces || []).filter(p => p.entity_id === e.id);
        const placesHtml = places.length
          ? places.map(p => `<span class="entity-place-tag" title="${this.escapeHtml(p.address || '')}"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(p.name)}</span>`).join('')
          : '';
        return `
          <div class="entity-row" data-entity-id="${e.id}">
            <span class="entity-type-badge entity-type-${this.escapeHtml(e.entity_type || 'other')}">${this.escapeHtml(e.entity_type || 'otro')}</span>
            <div class="entity-main">
              <span class="entity-name">${this.escapeHtml(e.name)}</span>
              ${places.length ? `<div class="entity-places">${placesHtml}</div>` : ''}
            </div>
            ${e.price != null ? `<span class="entity-price">${e.price} ${e.currency || 'USD'}</span>` : ''}
            <button type="button" class="entity-add-place-btn btn btn-ghost btn-sm" data-entity-id="${e.id}" title="Agregar lugar"><i class="fas fa-map-pin"></i></button>
            <button type="button" class="entity-delete-btn" data-entity-id="${e.id}" title="Eliminar" aria-label="Eliminar entidad">×</button>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.entity-delete-btn').forEach(btn => {
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          this.deleteEntity(btn.getAttribute('data-entity-id'));
        });
      });

      container.querySelectorAll('.entity-add-place-btn').forEach(btn => {
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          this.openAddPlaceModal(btn.getAttribute('data-entity-id'));
        });
      });
    }

    const addBtn = (this.container || document).querySelector('#addEntityBtn');
    if (addBtn && !addBtn._entityBound) {
      addBtn._entityBound = true;
      addBtn.addEventListener('click', () => this.openAddEntityModal());
    }
  }

  openAddPlaceModal(entityId) {
    document.getElementById('brandPlaceModal')?.remove();
    const entity = (this.brandEntities || []).find(e => e.id === entityId);
    const entityName = entity ? entity.name : entityId;

    const modalHtml = `
      <div class="modal-overlay" id="brandPlaceModal">
        <div class="modal">
          <div class="modal-header"><h3>Agregar lugar a <em>${this.escapeHtml(entityName)}</em></h3><button type="button" class="modal-close" id="placeModalClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="place_name">Nombre del lugar <span class="form-required">*</span></label><input type="text" id="place_name" class="form-input" placeholder="Ej: Tienda Ciudad de México" required></div>
            <div class="form-group"><label for="place_address">Dirección</label><input type="text" id="place_address" class="form-input" placeholder="Ej: Av. Insurgentes Sur 1234"></div>
            <div class="form-row">
              <div class="form-group"><label for="place_city">Ciudad</label><input type="text" id="place_city" class="form-input" placeholder="Ciudad"></div>
              <div class="form-group"><label for="place_country">País</label><input type="text" id="place_country" class="form-input" placeholder="País"></div>
            </div>
            <div class="form-group"><label for="place_type">Tipo</label><select id="place_type" class="form-input"><option value="store">Tienda</option><option value="office">Oficina</option><option value="warehouse">Bodega</option><option value="other">Otro</option></select></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="placeModalCancel">Cancelar</button><button type="button" class="btn btn-primary" id="placeModalSubmit">Agregar</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('placeModalClose')?.addEventListener('click', () => document.getElementById('brandPlaceModal')?.remove());
    document.getElementById('placeModalCancel')?.addEventListener('click', () => document.getElementById('brandPlaceModal')?.remove());
    document.getElementById('placeModalSubmit')?.addEventListener('click', async () => {
      if (!this.supabase) return;
      const name = document.getElementById('place_name')?.value?.trim();
      if (!name) { alert('El nombre del lugar es obligatorio.'); return; }
      const payload = {
        entity_id: entityId,
        name,
        address: document.getElementById('place_address')?.value?.trim() || null,
        city: document.getElementById('place_city')?.value?.trim() || null,
        country: document.getElementById('place_country')?.value?.trim() || null,
        place_type: document.getElementById('place_type')?.value || 'other',
      };
      const { data, error } = await this.supabase.from('brand_places').insert(payload).select().single();
      if (error) { console.error('BrandOrganizationView addPlace:', error); alert('Error al agregar el lugar.'); return; }
      this.brandPlaces = [...(this.brandPlaces || []), data];
      document.getElementById('brandPlaceModal')?.remove();
      this.renderBrandEntities();
    });
  }

  openAddEntityModal() {
    document.getElementById('brandEntityModal')?.remove();
    const ENTITY_TYPES = ['product', 'service', 'place', 'brand', 'influencer', 'competitor', 'other'];
    const typeOpts = ENTITY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

    const modalHtml = `
      <div class="modal-overlay" id="brandEntityModal">
        <div class="modal">
          <div class="modal-header"><h3>Nueva Entidad de Marca</h3><button type="button" class="modal-close" id="entityModalClose"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="form-group"><label for="ent_name">Nombre <span class="form-required">*</span></label><input type="text" id="ent_name" class="form-input" placeholder="Ej: Producto X" required></div>
            <div class="form-group"><label for="ent_type">Tipo <span class="form-required">*</span></label><select id="ent_type" class="form-input">${typeOpts}</select></div>
            <div class="form-group"><label for="ent_description">Descripción</label><textarea id="ent_description" class="form-input" rows="2"></textarea></div>
            <div class="form-row">
              <div class="form-group"><label for="ent_price">Precio</label><input type="number" id="ent_price" class="form-input" step="any" placeholder="0"></div>
              <div class="form-group"><label for="ent_currency">Moneda</label><select id="ent_currency" class="form-input"><option>USD</option><option>EUR</option><option>MXN</option><option>COP</option><option>ARS</option></select></div>
            </div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-ghost" id="entityModalCancel">Cancelar</button><button type="button" class="btn btn-primary" id="entityModalSubmit">Crear</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('entityModalClose')?.addEventListener('click', () => document.getElementById('brandEntityModal')?.remove());
    document.getElementById('entityModalCancel')?.addEventListener('click', () => document.getElementById('brandEntityModal')?.remove());
    document.getElementById('entityModalSubmit')?.addEventListener('click', () => this.submitCreateEntity());
  }

  async submitCreateEntity() {
    if (!this.supabase || !this.brandContainerData?.organization_id) return;
    const name = document.getElementById('ent_name')?.value?.trim();
    if (!name) { alert('El nombre es obligatorio.'); return; }

    const priceRaw = document.getElementById('ent_price')?.value;
    const payload = {
      organization_id: this.brandContainerData.organization_id,
      name,
      entity_type: document.getElementById('ent_type')?.value || 'other',
      description: document.getElementById('ent_description')?.value?.trim() || null,
      price: priceRaw ? parseFloat(priceRaw) : null,
      currency: document.getElementById('ent_currency')?.value || 'USD',
    };

    const { data, error } = await this.supabase.from('brand_entities').insert(payload).select().single();
    if (error) { console.error('BrandOrganizationView createEntity:', error); alert('Error al crear la entidad.'); return; }
    this.brandEntities = [...(this.brandEntities || []), data];
    document.getElementById('brandEntityModal')?.remove();
    this.renderBrandEntities();
  }

  async deleteEntity(entityId) {
    if (!confirm('¿Eliminar esta entidad? Se eliminarán también sus vínculos con productos y servicios.')) return;
    if (!this.supabase || !entityId) return;

    const { error } = await this.supabase.from('brand_entities').delete().eq('id', entityId);
    if (error) { console.error('BrandOrganizationView deleteEntity:', error); alert('Error al eliminar.'); return; }
    this.brandEntities = (this.brandEntities || []).filter(e => e.id !== entityId);
    this.renderBrandEntities();
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
      await this._reloadColors();
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
    const orgId = this.brandContainerData?.organization_id;
    if (!orgId) return;
    const { data: freshColors } = await this.supabase
      .from('brand_colors')
      .select('id, color_role, hex_value')
      .eq('organization_id', orgId);
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
          organization_id: orgId,
          color_role: colorRole,
          hex_value: hexNorm
        });
      if (error) throw error;
      await this._reloadColors();
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

  /** Devuelve la fuente de tipografía actual (para imágenes) desde brand_fonts (font_usage = 'images'). */
  getTypographyFontFamily() {
    const fontRow = (this.brandFonts || []).find(f => (f.font_usage || '').toLowerCase() === 'images');
    if (fontRow && fontRow.font_family) return fontRow.font_family;
    return 'Inter';
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
    BrandOrganizationView.TYPOGRAPHY_FONTS.forEach(f => this.loadFontForPreview(f.value));
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
    const fonts = BrandOrganizationView.TYPOGRAPHY_FONTS;
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

    const selectFont = async (fontValue) => {
      closePanel();
      this.loadFontForPreview(fontValue);
      const previousFonts = [...(this.brandFonts || [])];
      const others = (this.brandFonts || []).filter(f => (f.font_usage || '').toLowerCase() !== 'images');
      this.brandFonts = [...others, { organization_id: this.brandContainerData?.organization_id, font_usage: 'images', font_family: fontValue, font_weight: '400', fallback_font: 'sans-serif' }];
      this.renderTypography();
      try {
        if (this._typographySavePromise) await this._typographySavePromise;
        this._typographySavePromise = this.saveTypographyForImages(fontValue);
        await this._typographySavePromise;
      } catch (e) {
        this.brandFonts = previousFonts;
        this.renderTypography();
      } finally {
        this._typographySavePromise = null;
      }
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
      });
    });
  }

  async saveTypographyForImages(fontFamily) {
    const orgId = this.brandContainerData?.organization_id;
    if (!this.supabase || !orgId) return;
    try {
      const { data: existing } = await this.supabase
        .from('brand_fonts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('font_usage', 'images')
        .limit(1)
        .maybeSingle();
      if (existing) {
        await this.supabase
          .from('brand_fonts')
          .update({
            font_family: fontFamily,
            font_weight: '400',
            fallback_font: 'sans-serif'
          })
          .eq('id', existing.id);
      } else {
        await this.supabase
          .from('brand_fonts')
          .insert({
            organization_id: orgId,
            font_family: fontFamily,
            font_usage: 'images',
            font_weight: '400',
            fallback_font: 'sans-serif'
          });
      }
    } catch (e) {
      console.error('Error al guardar tipografía:', e);
      alert('No se pudo guardar la tipografía. Intenta de nuevo.');
    }
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
        <div class="identity-file-empty"></div>
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
    if (infoBtn && infoBtn.dataset.brandsInfoClickBound !== '1') {
      infoBtn.dataset.brandsInfoClickBound = '1';
      infoBtn.style.cursor = 'pointer';
      infoBtn.addEventListener('click', () => {
        this.openInfoPanel();
      });
    }

    if (localStorage.getItem('brands_open_info') === '1') {
      localStorage.removeItem('brands_open_info');
      setTimeout(() => this.openInfoPanel(), 300);
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

  _refreshInfoPanelIfOpen() {
    const root = this.container || document.getElementById('app-container');
    const infoCard = root?.querySelector('.card-info.expanded');
    if (!infoCard) return;
    const content = infoCard.querySelector('#infoPanelContent');
    if (content) {
      this.renderInfoPanelContent(content);
    }
  }

  /**
   * Lista de `brand_assets` del workspace en el panel INFO (sustituye integraciones sociales).
   */
  renderInfoAssetsSectionHtml() {
    const assets = this.brandAssets || [];
    if (!assets.length) {
      return `
      <section class="info-section info-section-assets" aria-labelledby="infoAssetsHeading">
        <h3 class="info-section-title" id="infoAssetsHeading">Assets</h3>
        <p class="info-assets-empty">Aún no hay archivos. Súbelos desde la card «Archivos de identidad».</p>
      </section>`;
    }
    const items = assets.slice(0, 16).map((a) => {
      const name = this.escapeHtml(a.file_name || 'Archivo');
      const url = this.escapeHtml(String(a.file_url || '').trim() || '#');
      const type = String(a.file_type || '').toLowerCase();
      const fname = String(a.file_name || '');
      const isImg =
        type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fname);
      const thumb = isImg
        ? `<img src="${url}" alt="" class="info-asset-thumb" loading="lazy" width="40" height="40">`
        : `<span class="info-asset-icon" aria-hidden="true"><i class="fas fa-file"></i></span>`;
      const sizeKb =
        a.file_size != null && Number.isFinite(Number(a.file_size))
          ? `<span class="info-asset-meta">${Math.max(1, Math.round(Number(a.file_size) / 1024))} KB</span>`
          : '';
      return `
        <li class="info-asset-row">
          <div class="info-asset-preview">${thumb}</div>
          <div class="info-asset-main">
            <span class="info-asset-name">${name}</span>
            ${sizeKb}
          </div>
          <a class="info-connect-external" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Abrir archivo"><i class="fas fa-external-link-alt" aria-hidden="true"></i></a>
        </li>`;
    }).join('');
    return `
      <section class="info-section info-section-assets" aria-labelledby="infoAssetsHeading">
        <h3 class="info-section-title" id="infoAssetsHeading">Assets</h3>
        <ul class="info-asset-list" role="list">${items}</ul>
      </section>`;
  }

  renderBrandSchemaAsideHtml() {
    const blocks = [
      { field: 'brand_name_oficial', label: 'Nombre de marca', type: 'text' },
      { field: 'name', label: 'Nombre del workspace', type: 'text' },
      { field: 'brand_slogan', label: 'Tagline / eslogan', type: 'textarea' },
      { field: 'level_of_autonomy', label: 'Nivel de autonomía', type: 'text' }
    ]
      .map(({ field, label, type }) => {
        const f = this.escapeHtml(field);
        const lab = this.escapeHtml(label);
        let control = '';
        if (type === 'text') {
          control = `<div class="info-brand-text-editor info-brand-field-value" data-field="${f}" data-editor-type="text"></div>`;
        } else if (type === 'textarea') {
          control = `<textarea class="info-brand-field-value info-brand-textarea" data-field="${f}" data-editor-type="textarea" rows="3" spellcheck="true"></textarea>`;
        }
        return `
      <div class="info-brand-field" data-brand-field="${f}">
        <div class="info-brand-field-label">${lab}</div>
        ${control}
      </div>`;
      })
      .join('');

    return `
      <div class="info-brand-aside-inner">
        <h3 class="info-section-title" id="infoBrandSchemaHeading">Organización</h3>
        <p class="info-brand-aside-lead">Campos persistidos en la fila del workspace.</p>
        <div class="info-brand-fields">
          ${blocks}
        </div>
      </div>
    `;
  }

  renderInfoPanelContent(container) {
    if (!container) return;
    const brandContainer = this.brandContainerData;
    container.innerHTML = `
      <div class="info-panel-grid">
        <div class="info-panel-grid__primary">
          <section class="info-section info-section-identity">
            <div class="info-section-content">
              ${this.renderIdentitySection(brandContainer)}
              </div>
          </section>
          ${this.renderInfoAssetsSectionHtml()}
        </div>
        <aside class="info-panel-grid__secondary" aria-labelledby="infoBrandSchemaHeading">
          ${this.renderBrandSchemaAsideHtml()}
        </aside>
      </div>
    `;
    this.setupInfoPanelEditables(container);
    if (typeof this.updateLinksForRouter === 'function') {
      this.updateLinksForRouter();
    }
  }

  setupInfoPanelEditables(container) {
    if (!container) return;
    const logoInput = container.querySelector('.info-logo-container input[type="file"]');
    if (logoInput && logoInput.dataset.infoLogoBound !== '1') {
      logoInput.dataset.infoLogoBound = '1';
      logoInput.addEventListener('change', (e) => {
        if (e.target.files[0]) this.uploadLogo(e.target.files[0]);
      });
    }
    this.setupInfoBrandFieldEditors(container);
  }

  /**
   * Normaliza valores para insert/update en `brands` según tipo de columna.
   * @param {string} fieldName
   * @param {*} value
   * @returns {string|string[]|object}
   */
  _normalizeBrandFieldForDb(fieldName, value) {
    const jsonFields = BrandOrganizationView.BRAND_JSON_FIELDS;
    const arrFields = BrandOrganizationView.BRAND_ARRAY_FIELDS;

    if (jsonFields.includes(fieldName)) {
      if (value == null || value === '') return {};
      if (typeof value === 'string') {
        try {
          const o = JSON.parse(value);
          return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
        } catch (_) {
          return {};
        }
      }
      if (typeof value === 'object' && !Array.isArray(value)) return value;
      return {};
    }

    if (arrFields.includes(fieldName)) {
      return Array.isArray(value) ? value : [];
    }

    if (fieldName === 'nicho_core') {
      return String(value ?? '').trim();
    }

    if (BrandOrganizationView.BRAND_TEXTAREA_FIELDS.includes(fieldName) || BrandOrganizationView.BRAND_TEXT_FIELDS.includes(fieldName)) {
      const s = value == null ? '' : String(value).trim();
      return s === '' ? null : s;
    }

    return value;
  }

  setupInfoBrandFieldEditors(container) {
    const brand = this.brandData;

    container.querySelectorAll('[data-editor-type="text"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      el.textContent = raw != null ? String(raw) : '';
      this.makeEditableText(el, field, 'brand', null);
    });

    container.querySelectorAll('[data-editor-type="textarea"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      el.value = raw != null ? String(raw) : '';
      if (el.dataset.brandTextareaBound === '1') return;
      el.dataset.brandTextareaBound = '1';
      el.addEventListener('blur', async () => {
        const v = el.value.trim();
        const cur = this.brandData?.[field] != null ? String(this.brandData[field]).trim() : '';
        if (v !== cur) await this.saveBrandField(field, v === '' ? null : v);
      });
    });

    container.querySelectorAll('[data-editor-type="json"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      if (raw && typeof raw === 'object') {
        el.value = JSON.stringify(raw, null, 2);
      } else if (typeof raw === 'string') {
        el.value = raw;
      } else {
        el.value = '{}';
      }
      if (el.dataset.brandJsonBound === '1') return;
      el.dataset.brandJsonBound = '1';
      el.addEventListener('blur', async () => {
        let parsed = {};
        const t = el.value.trim();
        if (t) {
          try {
            parsed = JSON.parse(t);
          } catch (_) {
            alert(`JSON no válido en ${field}. Revisá la sintaxis.`);
            el.focus();
            return;
          }
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          alert('Este campo debe ser un objeto JSON (por ejemplo { "clave": "valor" }).');
          return;
        }
        const prev = JSON.stringify(this.brandData?.[field] || {});
        const next = JSON.stringify(parsed);
        if (prev !== next) await this.saveBrandField(field, parsed);
        el.value = JSON.stringify(this.brandData?.[field] || {}, null, 2);
      });
    });

    container.querySelectorAll('.info-brand-array-editor[data-field]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      this.makeEditableMultiSelect(el, field, [], 'brand', null);
    });

    container.querySelectorAll('.info-brand-select[data-editor-type="select"]').forEach((wrap) => {
      this._bindInfoBrandNichoSelect(wrap);
    });
  }

  /**
   * Desplegable custom para nicho_core (estilo pill + lista, sin depender de &lt;select&gt; nativo).
   */
  _bindInfoBrandNichoSelect(wrap) {
    const field = wrap.getAttribute('data-field');
    if (field !== 'nicho_core' || wrap.dataset.nichoSelectBound === '1') return;
    wrap.dataset.nichoSelectBound = '1';

    const trigger = wrap.querySelector('.info-brand-select__trigger');
    const panel = wrap.querySelector('.info-brand-select__panel');
    const valueEl = wrap.querySelector('.info-brand-select__value');
    if (!trigger || !panel || !valueEl) return;

    const getOptions = () => panel.querySelectorAll('.info-brand-select__option');

    const setOpen = (open) => {
      if (wrap._nichoDocCloser) {
        document.removeEventListener('click', wrap._nichoDocCloser, true);
        wrap._nichoDocCloser = null;
      }
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      wrap.classList.toggle('is-open', open);
      if (open) {
        wrap._nichoDocCloser = (ev) => {
          if (!wrap.contains(ev.target)) setOpen(false);
        };
        setTimeout(() => document.addEventListener('click', wrap._nichoDocCloser, true), 0);
      }
    };

    const syncSelectionClasses = () => {
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      getOptions().forEach((li) => {
        const v = li.getAttribute('data-value') != null ? li.getAttribute('data-value') : '';
        li.classList.toggle('is-selected', v === cur);
      });
    };

    const refreshLabel = () => {
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      valueEl.textContent = BrandOrganizationView.getNichoCoreLabel(cur);
    };

    refreshLabel();
    syncSelectionClasses();

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(panel.hidden);
    });

    panel.addEventListener('click', async (e) => {
      const li = e.target.closest('.info-brand-select__option');
      if (!li || !panel.contains(li)) return;
      e.stopPropagation();
      const v = li.getAttribute('data-value') != null ? li.getAttribute('data-value') : '';
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      if (v !== cur) await this.saveBrandField(field, v);
      refreshLabel();
      syncSelectionClasses();
      setOpen(false);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
        e.preventDefault();
        setOpen(false);
      }
    });
  }

  renderIdentitySection(brandContainer) {
    const logoUrl = brandContainer?.logo_url;
    const isValidLogoUrl = logoUrl &&
      (logoUrl.startsWith('http://') ||
       logoUrl.startsWith('https://') ||
       logoUrl.startsWith('/'));

    return `
      <div class="info-identity-row info-identity-row--logo-only">
        <div class="info-logo-container">
          ${isValidLogoUrl
            ? `<img src="${this.escapeHtml(logoUrl)}" alt="" class="info-logo-preview" onerror="this.style.display='none';var p=this.nextElementSibling;if(p)p.classList.add('visible');">`
            : ''
          }
          <div class="info-logo-placeholder ${isValidLogoUrl ? '' : 'visible'}"><i class="fas fa-image"></i></div>
          <input type="file" accept="image/*" class="info-logo-input" title="Subir logo">
        </div>
      </div>
    `;
  }

  // ============================================
  // MÉTODOS DE GUARDADO
  // ============================================

  async saveContainerField(fieldName, value) {
    if (!this.supabase || !this.organizationRow) return;

    const saveKey = `container_${fieldName}`;
    if (this.savingFields.has(saveKey)) return;
    this.savingFields.add(saveKey);

    try {
      if (fieldName === 'nombre_marca') {
        const v = (value || '').trim() || null;
        await this._patchOrganization({ brand_name_oficial: v });
      } else if (fieldName === 'mercado_objetivo') {
        /* no columna en organizations */
      } else if (fieldName === 'logo_url') {
        await this._patchOrganization({ logo_url: value || null });
      } else {
        const allowed = new Set(['name', 'brand_name_oficial', 'brand_slogan', 'level_of_autonomy']);
        if (!allowed.has(fieldName)) {
          console.warn('BrandOrganizationView: campo organizations no soportado:', fieldName);
        } else {
          await this._patchOrganization({ [fieldName]: value || null });
        }
      }
    } catch (error) {
      console.error(`BrandOrganizationView saveContainerField ${fieldName}:`, error);
      alert(`Error al guardar ${fieldName}.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  async saveBrandField(fieldName, value) {
    if (!this.supabase || !this.organizationRow) return;
    const allowed = new Set(['name', 'brand_name_oficial', 'brand_slogan', 'level_of_autonomy']);
    if (!allowed.has(fieldName)) return;

    let v = value;
    if (typeof v === 'string') v = v.trim() || null;

    const saveKey = `brand_${fieldName}`;
    if (this.savingFields.has(saveKey)) return;
    this.savingFields.add(saveKey);
    try {
      await this._patchOrganization({ [fieldName]: v });
      if (this.brandData) this.brandData[fieldName] = v;
    } catch (error) {
      console.error('BrandOrganizationView saveBrandField:', error);
      alert(`Error al guardar ${fieldName}.`);
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

      await this._reloadColors();
      this.renderCards();
      this.applyBrandBackgroundGradient(true);
      console.log(`✅ Color eliminado`);
    } catch (error) {
      console.error(`❌ Error al eliminar color:`, error);
      alert(`Error al eliminar color. Por favor, intenta de nuevo.`);
    }
  }

  async uploadLogo(file) {
    if (!file || !this.organizationRow) return;
    if (!this.supabase && window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    }
    if (!this.supabase) {
      alert('No se pudo conectar. Intenta de nuevo.');
      return;
    }
    const orgId = this.organizationRow.id;
    const container = this.container || document.getElementById('app-container');
    const logoWrap = container?.querySelector('.info-logo-container');
    if (logoWrap) {
      logoWrap.style.pointerEvents = 'none';
      logoWrap.style.opacity = '0.7';
    }
    try {
      const fileExt = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `org_logo_${orgId}_${Date.now()}.${fileExt}`;
      const filePath = `${orgId}/${fileName}`;
      const bucket = 'brand-logos';

      const { error: uploadError } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl }
      } = this.supabase.storage.from(bucket).getPublicUrl(filePath);

      await this._patchOrganization({ logo_url: publicUrl });
      if (this.brandContainerData) this.brandContainerData.logo_url = publicUrl;
      this.renderAll();
      const infoCard = container?.querySelector('.card-info.expanded');
      if (infoCard) {
        const content = infoCard.querySelector('.card-content-expanded');
        if (content) this.renderInfoPanelContent(content);
      }
      const logoInput = (this.container || document.getElementById('app-container'))?.querySelector(
        '.info-logo-container input[type="file"]'
      );
      if (logoInput) logoInput.value = '';
    } catch (error) {
      console.error('BrandOrganizationView uploadLogo:', error);
      alert('Error al subir logo.');
    } finally {
      if (logoWrap) {
        logoWrap.style.pointerEvents = '';
        logoWrap.style.opacity = '';
      }
    }
  }

  async uploadAsset(file) {
    if (!this.supabase || !this.organizationRow) return;
    const orgId = this.organizationRow.id;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `org_asset_${orgId}_${Date.now()}.${fileExt}`;
      const filePath = `organizations/${orgId}/assets/${fileName}`;

      const { error: uploadError } = await this.supabase.storage.from('brand-core').upload(filePath, file);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl }
      } = this.supabase.storage.from('brand-core').getPublicUrl(filePath);

      const { error: insertError } = await this.supabase.from('brand_assets').insert({
        organization_id: orgId,
        asset_scope: 'organization',
        brand_container_id: null,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size
      });

      if (insertError) throw insertError;

      await this._reloadAssets();
      this.renderIdentityFiles();
    } catch (error) {
      console.error('BrandOrganizationView uploadAsset:', error);
      alert('Error al subir archivo.');
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

      const removeBtn = document.createElement('span');
      removeBtn.className = 'editable-tag-remove';
      removeBtn.innerHTML = ' ×';
      removeBtn.setAttribute('aria-label', 'Quitar');
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
    // INFO usa #infoPanelContent; mercado_objetivo vive en #brandMarketLabel (fuera del panel).
    const panel = document.getElementById('infoPanelContent');
    const element = panel
      ? panel.querySelector(`[data-field="${fieldName}"]`)
      : null;
    const target = element || document.querySelector(`[data-field="${fieldName}"]`);
    if (target) {
      this.makeEditableMultiSelect(target, fieldName, [], table, onSave);
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

window.BrandOrganizationView = BrandOrganizationView;
