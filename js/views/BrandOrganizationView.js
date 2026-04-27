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
    /** @type {Array} Filas brand_containers de la organización (sub-marcas) */
    this.brandContainers = [];
    /** @type {Array} Integraciones de sub-marcas (brand_integrations) */
    this.brandIntegrations = [];
    /** @type {Array} Campañas de sub-marcas (campaigns) */
    this.brandCampaigns = [];
    /** Org UUID con la que se cargó la vista (navegación suave mismo ViewClass) */
    this._mountedOrgId = null;
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
        <div class="background-film-grain" aria-hidden="true"></div>
    </div>

    <!-- Footer: MARCA + Mercado -->
    <div class="brand-corner-bottom-left">
        <div class="brand-main-info">
            <button type="button" class="brand-corner-logo-btn" id="brandCornerLogoBtn" aria-label="Subir logo de organización">
                <span class="brand-corner-logo-inner" id="brandCornerLogoInner">
                    <i class="fas fa-plus" aria-hidden="true"></i>
                </span>
                <input type="file" id="brandCornerLogoInput" class="brand-corner-logo-input" accept="image/*">
            </button>
            <div class="brand-name-row">
                <h1 class="brand-name-large" id="brandNameLarge"></h1>
                <div class="brand-status-indicator"><span class="status-dot"></span></div>
            </div>
            <div class="brand-slogan-row">
                <input type="text" class="brand-slogan-input" id="brandSloganInput" placeholder="Slogan" aria-label="Slogan">
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

        <!-- Assets -->
        <div class="brand-card card-assets">
            <div class="card-header">
                <h2 class="card-title">Assets</h2>
            </div>
            <div class="card-content">
                <div class="assets-files" id="assetsFilesContainer"></div>
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

  /**
   * Evita destruir y volver a pintar el shell cuando solo cambia la URL entre rutas de la misma vista
   * (p. ej. /brands ↔ /brand-organization) y el workspace es el mismo. Brand Storage es otra vista.
   * @param {string} path
   * @param {Record<string, string>} routeParams
   * @returns {Promise<boolean>}
   */
  async handleSameViewClassNavigation(_path, routeParams) {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
        window.router.navigate('/login', true);
        return false;
      }
    }
    const nextOrg = typeof window !== 'undefined' ? (window.currentOrgId ?? null) : null;
    if ((this._mountedOrgId ?? null) !== (nextOrg ?? null)) {
      return false;
    }
    this.routeParams = routeParams || {};
    this.isActive = true;
    await this.ensureDataLoaded();
    if ((this._mountedOrgId ?? null) !== (typeof window !== 'undefined' ? (window.currentOrgId ?? null) : null)) {
      return false;
    }
    this.renderAll();
    await this.updateHeader();
    return true;
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
      this._mountedOrgId = null;
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

      // Solo columnas leídas por la vista (ver _mergeOrgIntoShim y referencias a organizationRow).
      const { data: org, error: orgErr } = await this.supabase
        .from('organizations')
        .select('id, name, brand_name_oficial, brand_slogan, logo_url, level_of_autonomy')
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

      // `this.products` no se consume aquí; query mínima por compatibilidad con el shape esperado.
      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('id')
        .eq('organization_id', orgId)
        .limit(5);
      if (productsError) {
        console.warn('BrandOrganizationView: productos', productsError);
        this.products = [];
      } else {
        this.products = products || [];
      }

      // Campos efectivamente leídos: id, asset_type, storage_path, bucket, file_name,
      // file_type, file_url, created_at. Añadimos file_size por paridad con otras vistas.
      const { data: assets, error: assetsError } = await this.supabase
        .from('brand_assets')
        .select('id, asset_type, storage_path, bucket, file_name, file_type, file_url, file_size, created_at')
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

      // Cargar sub-marcas (brand_containers) para el estado dual
      try {
        const { data: containerRows } = await this.supabase
          .from('brand_containers')
          .select('id, nombre_marca, idiomas_contenido, mercado_objetivo, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos, updated_at, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        this.brandContainers = containerRows || [];

        const containerIds = this.brandContainers.map((r) => r.id).filter(Boolean);
        if (containerIds.length) {
          // audiences: a menudo no existe en PostgREST (404); esta vista no pinta audiencias en UI → no prefetch.
          const [campaignsRes, integrationsRes] = await Promise.allSettled([
            this.supabase
              .from('campaigns')
              .select('id, brand_container_id, nombre_campana, descripcion_interna, contexto_temporal, objetivos_estrategicos, tono_modificador, audience_id, created_at')
              .in('brand_container_id', containerIds)
              .order('created_at', { ascending: false }),
            this.supabase
              .from('brand_integrations')
              .select('id, brand_container_id, platform, external_account_name, is_active, token_expires_at, metadata, last_sync_at, updated_at')
              .in('brand_container_id', containerIds)
              .order('platform', { ascending: true })
          ]);
          this.brandAudiences = [];
          this.brandCampaigns = campaignsRes.status === 'fulfilled' && !campaignsRes.value.error
            ? (campaignsRes.value.data || []) : [];
          this.brandIntegrations = integrationsRes.status === 'fulfilled' && !integrationsRes.value.error
            ? (integrationsRes.value.data || []) : [];
        } else {
          this.brandCampaigns = [];
          this.brandIntegrations = [];
        }
      } catch (e) {
        console.warn('BrandOrganizationView: brand_containers', e);
        this.brandContainers = [];
        this.brandCampaigns = [];
        this.brandIntegrations = [];
      }

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
      this._mountedOrgId = this.organizationRow?.id ?? null;
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
      .select('id, asset_type, storage_path, bucket, file_name, file_type, file_url, file_size, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(12);
    this.brandAssets = data || [];
  }

  // Catálogos ahora viven en /js/config/brand-schema.js (fuente única compartida
  // con BrandstorageView). Variante ORG = schema sin `idiomas_contenido` ni
  // `mercado_objetivo` (aplican solo a sub-marca, no a organización).
  static get NICHO_CORE_OPTIONS()    { return window.BrandSchema.NICHO_CORE_OPTIONS; }
  static getNichoCoreLabel(v)        { return window.BrandSchema.getNichoCoreLabel(v); }
  static get BRAND_SCHEMA_BLOCKS()   { return window.BrandSchema.BRAND_SCHEMA_BLOCKS_ORG; }
  static get BRAND_ARRAY_FIELDS()    { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_ORG, 'array'); }
  static get BRAND_JSON_FIELDS()     { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_ORG, 'json'); }
  static get BRAND_TEXT_FIELDS()     { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_ORG, 'text'); }
  static get BRAND_TEXTAREA_FIELDS() { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_ORG, 'textarea'); }
  static get TYPOGRAPHY_FONTS()      { return window.BrandSchema.TYPOGRAPHY_FONTS; }

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

  // Color utils ahora viven en /js/utils/brand-colors.js (ver BrandstorageView).
  // Aliases de instancia para mantener `this.hexToX()` funcionando sin tocar callers.
  hexToRgba(hex, alpha = 1)          { return window.BrandColors.hexToRgba(hex, alpha); }
  hexToHSL(hex)                      { return window.BrandColors.hexToHSL(hex); }
  hslToHex(h, s, l)                  { return window.BrandColors.hslToHex(h, s, l); }
  filterAndScoreBrandColors(hexes)   { return window.BrandColors.filterAndScoreBrandColors(hexes); }
  getBrandUIPalette(brandColors)     { return window.BrandColors.getBrandUIPalette(brandColors); }
  buildBrandGradientCss(hexes, angle = 135) { return window.BrandColors.buildBrandGradientCss(hexes, angle); }

  /** Hook llamado por ColorEditor.mixin.js tras cada cambio de color. */
  _refreshVisualChrome() {
    this.applyBrandBackgroundGradient(true);
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
    this.renderCornerLogoUploader();
    this.renderBrandName();
    this.renderBrandSlogan();
    this.renderMarket();
    this.renderCards();
  }

  renderCornerLogoUploader() {
    const btn = document.getElementById('brandCornerLogoBtn');
    const inner = document.getElementById('brandCornerLogoInner');
    const input = document.getElementById('brandCornerLogoInput');
    if (!btn || !inner || !input) return;

    const logoUrl = String(this.brandContainerData?.logo_url || '').trim();
    if (logoUrl) {
      inner.innerHTML = `<img src="${this.escapeHtml(logoUrl)}" alt="Logo organización" class="brand-corner-logo-img" loading="lazy">`;
      btn.classList.add('has-logo');
    } else {
      inner.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';
      btn.classList.remove('has-logo');
    }

    if (btn.dataset.logoBound !== '1') {
      btn.dataset.logoBound = '1';
      btn.addEventListener('click', () => input.click());
    }
    if (input.dataset.logoBound !== '1') {
      input.dataset.logoBound = '1';
      input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.uploadLogo(file);
        input.value = '';
      });
    }
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

  renderBrandSlogan() {
    const el = document.getElementById('brandSloganInput');
    if (!el) return;
    const slogan = String(this.brandData?.brand_slogan || '').trim();
    el.value = slogan;
    el.classList.toggle('is-placeholder', !slogan);

    if (el.dataset.sloganBound === '1') return;
    el.dataset.sloganBound = '1';

    el.addEventListener('focus', () => {
      el.classList.remove('is-placeholder');
    });

    el.addEventListener('blur', async () => {
      const next = String(el.value || '').trim();
      const prev = String(this.brandData?.brand_slogan || '').trim();
      if (next === prev) {
        el.classList.toggle('is-placeholder', !next);
        return;
      }
      await this.saveBrandField('brand_slogan', next || null);
      el.classList.toggle('is-placeholder', !next);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
    });
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
    const container = this.container || document.getElementById('app-container');
    const root = container?.querySelector('#brandsListContainer');
    if (root) root.classList.remove('brand-storage-gallery-view');

    const showInfoCard = Array.isArray(this.brandContainers) && this.brandContainers.length === 1;
    const infoCardEl = container?.querySelector('.card-info:not(.expanded)');
    if (infoCardEl) infoCardEl.style.display = showInfoCard ? '' : 'none';

    ['card-concept', 'card-identity', 'card-assets'].forEach((cls) => {
      const card = container?.querySelector(`.${cls}`);
      if (card) card.style.display = '';
    });

    container?.querySelector('.brand-cards-zone .card-storage-library')?.remove();

    const corner = container?.querySelector('.brand-corner-bottom-left');
    if (corner) corner.style.display = '';

    this.renderBrandColors();
    this.renderTypography();
    this.renderIdentityFiles();
    this.renderAssetsFiles();
    this.setupIdentityUpload();
    this.setupAssetsUpload();

    this.setupEventListeners();
  }

  /** Ruta a la página dedicada Brand Storage (sub-marcas). */
  getBrandStoragePageHref() {
    const orgId = window.currentOrgId || this.organizationRow?.id;
    const orgName = (window.currentOrgName || this.organizationRow?.name || '').trim();
    if (orgId && orgName && typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(orgId, orgName);
      if (prefix) return `${prefix}/brand-storage`;
    }
    return '/brand-storage';
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

  // ─────────────────────────────────────────────────────────────────────────
  // Editor de color + Tipografía: extraídos a mixins bajo
  //   /js/views/brand-organization/
  //
  //   · ColorEditor.mixin.js:
  //       openColorEditor, updateColor, pickNextColorRole, createColor, deleteColor.
  //   · Typography.mixin.js:
  //       getTypographyFontFamily, loadFontForPreview, loadAllTypographyFonts,
  //       renderTypography, saveTypographyForImages.
  // ─────────────────────────────────────────────────────────────────────────

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

    const identityAssets = this.getIdentityAssets();
    if (!identityAssets.length) {
      container.innerHTML = '';
      container.classList.add('identity-files--empty');
      return;
    }

    container.classList.remove('identity-files--empty');

    container.innerHTML = identityAssets.map((asset) => {
      const fileName = asset.file_name || 'Archivo identidad';
      const fileType = String(asset.file_type || '').toLowerCase();
      const fileUrl = String(asset.file_url || '').trim();
      const isImage = fileType.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
      const preview = isImage && fileUrl
        ? `<img src="${this.escapeHtml(fileUrl)}" alt="" class="identity-logo-preview" loading="lazy">`
        : '<i class="fas fa-file asset-file-fallback-icon"></i>';
      return `
        <div class="identity-file-item identity-file-item--logo" data-identity-asset-id="${asset.id}">
          <div class="assets-file-preview">${preview}</div>
          <div class="identity-file-info">
            <div class="identity-file-name">${this.escapeHtml(fileName)}</div>
          </div>
          <div class="assets-file-actions">
            ${fileUrl ? `<a href="${this.escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" class="asset-action-btn" aria-label="Abrir archivo identidad"><i class="fas fa-external-link-alt"></i></a>` : ''}
            <button type="button" class="asset-action-btn asset-action-btn--danger" data-remove-asset-id="${asset.id}" aria-label="Eliminar archivo identidad">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-remove-asset-id]').forEach((btn) => {
      if (btn.dataset.assetBound === '1') return;
      btn.dataset.assetBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeAsset(btn.getAttribute('data-remove-asset-id'));
      });
    });
  }

  renderAssetsFiles() {
    const container = (this.container && this.container.querySelector('#assetsFilesContainer')) ||
                      document.getElementById('assetsFilesContainer');
    if (!container) return;

    const identityIds = new Set(this.getIdentityAssets().map((a) => a.id));
    const assets = (this.brandAssets || []).filter((a) => !identityIds.has(a.id));
    if (!assets.length) {
      container.innerHTML = '';
      container.classList.add('assets-files--empty');
      return;
    }

    container.classList.remove('assets-files--empty');

    container.innerHTML = assets.map((asset) => {
      const fileName = asset.file_name || 'Archivo';
      const fileType = String(asset.file_type || asset.asset_type || 'file').toLowerCase();
      const fileUrl = String(asset.file_url || '').trim();
      const uploadDate = asset.created_at ? new Date(asset.created_at) : null;
      const isImage = fileType.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);

      const dateText = uploadDate
        ? `Subido · ${uploadDate.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}`
        : '';

      const preview = isImage && fileUrl
        ? `<img src="${this.escapeHtml(fileUrl)}" alt="" class="asset-file-thumb" loading="lazy">`
        : '<i class="fas fa-file asset-file-fallback-icon"></i>';

      return `
        <div class="assets-file-item" data-asset-id="${asset.id}">
          <div class="assets-file-preview">${preview}</div>
          <div class="identity-file-info">
            <div class="identity-file-name">${this.escapeHtml(fileName)}</div>
            ${dateText ? `<div class="identity-file-date">${dateText}</div>` : ''}
          </div>
          <div class="assets-file-actions">
            ${fileUrl ? `<a href="${this.escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" class="asset-action-btn" aria-label="Abrir asset"><i class="fas fa-external-link-alt"></i></a>` : ''}
            <button type="button" class="asset-action-btn asset-action-btn--danger" data-remove-asset-id="${asset.id}" aria-label="Eliminar asset">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-remove-asset-id]').forEach((btn) => {
      if (btn.dataset.assetBound === '1') return;
      btn.dataset.assetBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeAsset(btn.getAttribute('data-remove-asset-id'));
      });
    });
  }

  getIdentityAssets() {
    return (this.brandAssets || []).filter((asset) => {
      if (!asset || !asset.id) return false;
      const assetType = String(asset.asset_type || '').toLowerCase();
      if (assetType === 'identity') return true;
      const path = String(asset.storage_path || '').toLowerCase();
      return path.includes('/identity/');
    });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Panel INFO (apertura, cierre, render del schema, editables save-on-blur):
  //   extraído a /js/views/brand-organization/InfoPanel.mixin.js
  //
  // Métodos movidos: openInfoPanel, closeInfoPanel, _refreshInfoPanelIfOpen,
  //   renderInfoAssetsSectionHtml, renderBrandSchemaAsideHtml,
  //   renderInfoPanelContent, setupInfoPanelEditables,
  //   _normalizeBrandFieldForDb, setupInfoBrandFieldEditors,
  //   _bindInfoBrandNichoSelect.
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // Subida de archivos (logo / assets / identidad): extraído a
  //   /js/views/brand-organization/Uploads.mixin.js
  //
  // Métodos movidos: uploadLogo, uploadAsset, uploadIdentityFile,
  //   removeAsset, _extractStoragePathFromUrl, setupIdentityUpload,
  //   setupAssetsUpload.
  // ─────────────────────────────────────────────────────────────────────────
}

window.BrandOrganizationView = BrandOrganizationView;
['__applyTypographyMixinToBrandViews', '__applyUploadsMixinToBrandViews', '__applyColorEditorMixinToBrandViews'].forEach((k) => {
  if (typeof window[k] === 'function') window[k]();
});
