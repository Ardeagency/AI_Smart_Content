/**
 * BrandstorageView — Página dedicada: biblioteca de sub-marcas (`brand_containers`) + paneles INFO.
 * Independiente de BrandOrganizationView (misma lógica de datos/UI en este módulo).
 */
class BrandstorageView extends BaseView {
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
    this.brandCampaigns = [];
    this.brandIntegrations = [];
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
    /** @type {Array<object>} Biblioteca de brand_containers de la organización */
    this.brandContainers = [];
    /** Org UUID con la que se cargó la vista (navegación suave mismo ViewClass) */
    this._mountedOrgId = null;
    /** Conteos de filas `system_ai_outputs` por `brand_container_id` (producciones) */
    this._productionCountsByContainerId = {};
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
<!-- Brand Storage Library — misma capa skeleton + degradado que Brand Identity -->
<div class="brand-dashboard-container brand-storage-standalone brand-storage-gallery-view" id="brandsListContainer">

    <div class="brand-dashboard-background">
        <div class="background-skeleton" id="backgroundSkeleton" aria-hidden="true"></div>
        <div class="background-gradient" id="backgroundGradient"></div>
        <div class="background-film-grain" aria-hidden="true"></div>
    </div>

    <!-- Biblioteca de marcas -->
    <div class="brand-cards-zone">
        <div class="brand-card card-storage-library">
            <div class="card-header">
                <h2 class="card-title">Sub-marcas</h2>
                <span class="card-title-counter" id="brandStorageCount">0</span>
            </div>
            <div class="card-content">
                <div class="brand-storage-grid brand-storage-grid--masonry" id="brandStorageGrid"></div>
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
    const orgId = typeof window !== 'undefined' ? window.currentOrgId : null;
    if (orgId && window.OrgBrandTheme && typeof window.OrgBrandTheme.applyOrgBrandTheme === 'function') {
      await window.OrgBrandTheme.applyOrgBrandTheme(orgId);
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

  /** URL de retorno OAuth acorde al prefijo org (si aplica). */
  getBrandStorageReturnPath() {
    const orgId = window.currentOrgId || this.organizationRow?.id;
    const orgName = (window.currentOrgName || this.organizationRow?.name || '').trim();
    if (orgId && orgName && typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(orgId, orgName);
      if (prefix) return `${prefix}/brand-storage`;
    }
    return '/brand-storage';
  }

  /**
   * Navegación entre rutas de Brand Storage sin remontar el DOM (misma clase de vista).
   * @param {string} _path
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
      const storageGridEl = container.querySelector('#brandStorageGrid') || document.getElementById('brandStorageGrid');
      if (storageGridEl) {
        // Primer render inmediato con lo que haya (puede ser vacío)
        this.renderAll();
        const root = container.querySelector('#brandsListContainer');
        if (root) root.classList.add('brands-ready');
        (async () => {
          await this.ensureDataLoaded();
          if (!this.isActive) return;
          this.renderAll();
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
    this.updateHeaderContext('Brand Storage', name);
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
      this._productionCountsByContainerId = {};
      return;
    }

    try {
      this._productionCountsByContainerId = {};
      const orgId = typeof window !== 'undefined' ? window.currentOrgId : null;
      if (!orgId) {
        this.organizationRow = null;
        this.brandContainerData = null;
        this.brandContainers = [];
        this.brandData = null;
        this.products = [];
        this.brandAssets = [];
        this.brandEntities = [];
        this.brandPlaces = [];
        this.brandAudiences = [];
        this.brandCampaigns = [];
        this.brandIntegrations = [];
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
        console.warn('BrandstorageView: error cargando organizations', orgErr);
      }

      if (!org) {
        this.organizationRow = null;
        this.brandContainerData = null;
        this.brandContainers = [];
        this.brandData = null;
        this.products = [];
        this.brandAssets = [];
        this.brandEntities = [];
        this.brandPlaces = [];
        this.brandAudiences = [];
        this.brandCampaigns = [];
        this.brandIntegrations = [];
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

      const { data: containerRows, error: containersError } = await this.supabase
        .from('brand_containers')
        .select('id, nombre_marca, idiomas_contenido, mercado_objetivo, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos, updated_at, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (containersError) {
        console.warn('BrandstorageView: brand_containers', containersError);
        this.brandContainers = [];
      } else {
        this.brandContainers = containerRows || [];
      }

      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .limit(5);
      if (productsError) {
        console.warn('BrandstorageView: productos', productsError);
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
        console.warn('BrandstorageView: brand_assets', assetsError);
        this.brandAssets = [];
      } else {
        this.brandAssets = assets || [];
      }

      const containerIds = (this.brandContainers || []).map((row) => row.id).filter(Boolean);

      // brand_entities: IdentitiesView usa organization_id; filtrar por sub-marca en cliente si existe brand_container_id.
      // campaigns: orden por created_at (updated_at puede no existir en algunos esquemas → 400).
      // audiences: muchos proyectos no exponen la tabla en PostgREST (404); no prefetch aquí para evitar ruido en consola.
      const [entitiesResult, campaignsResult, integrationsResult] = await Promise.allSettled([
        this.supabase
          .from('brand_entities')
          .select('id, organization_id, name, entity_type, description, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        containerIds.length
          ? this.supabase
            .from('campaigns')
            .select('id, brand_container_id, nombre_campana, descripcion_interna, contexto_temporal, objetivos_estrategicos, tono_modificador, audience_id, created_at')
            .in('brand_container_id', containerIds)
            .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        containerIds.length
          ? this.supabase
            .from('brand_integrations')
            .select('id, brand_container_id, platform, external_account_name, is_active, token_expires_at, metadata, last_sync_at, updated_at')
            .in('brand_container_id', containerIds)
            .order('platform', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      const entitiesRaw = entitiesResult.status === 'fulfilled' && !entitiesResult.value.error
        ? (entitiesResult.value.data || [])
        : [];
      this.brandEntities = containerIds.length
        ? entitiesRaw.filter((e) => !e.brand_container_id || containerIds.includes(String(e.brand_container_id)))
        : entitiesRaw;
      this.brandPlaces = [];
      this.brandAudiences = [];
      this.brandCampaigns = campaignsResult.status === 'fulfilled' && !campaignsResult.value.error
        ? (campaignsResult.value.data || [])
        : [];
      this.brandIntegrations = integrationsResult.status === 'fulfilled' && !integrationsResult.value.error
        ? (integrationsResult.value.data || [])
        : [];

      if (this.supabase && containerIds.length) {
        try {
          const { data: outRows, error: outErr } = await this.supabase
            .from('system_ai_outputs')
            .select('brand_container_id')
            .in('brand_container_id', containerIds);
          if (!outErr && Array.isArray(outRows)) {
            outRows.forEach((row) => {
              const k = String(row.brand_container_id || '');
              if (!k) return;
              this._productionCountsByContainerId[k] = (this._productionCountsByContainerId[k] || 0) + 1;
            });
          }
        } catch (e) {
          console.warn('BrandstorageView: conteo producciones (system_ai_outputs)', e);
        }
      }

      this.brandColors = await this._queryBrandColorsRows();
      this.brandFonts = await this._queryBrandFontsRows();
      this.brandRules = [];
      this._syncRootGradientFromBrandColors();

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
        console.warn('BrandstorageView: datos org secundarios', e);
        this.organizationMembers = [];
        this.organizationCredits = { credits_available: 100 };
        this.creditUsage = [];
      }
    } catch (error) {
      console.error('BrandstorageView loadData:', error);
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

  /** UUID de organización del workspace (colores/fuentes viven por org, no solo con contenedor activo). */
  _getWorkspaceOrganizationId() {
    return (
      this.organizationRow?.id ||
      this.brandContainerData?.organization_id ||
      (typeof window !== 'undefined' ? window.currentOrgId : null) ||
      null
    );
  }

  /**
   * Filas de brand_colors por organization_id.
   */
  async _queryBrandColorsRows() {
    const orgId = this._getWorkspaceOrganizationId();
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
    const orgId = this._getWorkspaceOrganizationId();
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

  /** Opciones del desplegable `nicho_core` (valor guardado = `value`). */
  // Catálogos de marca ahora viven en /js/config/brand-schema.js (fuente única,
  // compartida con BrandOrganizationView). Estos getters estáticos mantienen la
  // API `BrandstorageView.NICHO_CORE_OPTIONS` para no tocar el resto del archivo.
  static get NICHO_CORE_OPTIONS()      { return window.BrandSchema.NICHO_CORE_OPTIONS; }
  static getNichoCoreLabel(v)          { return window.BrandSchema.getNichoCoreLabel(v); }
  static get BRAND_SCHEMA_BLOCKS()     { return window.BrandSchema.BRAND_SCHEMA_BLOCKS_CONTAINER; }
  static get BRAND_IDIOMAS_OPTIONS()   { return window.BrandSchema.BRAND_IDIOMAS_OPTIONS; }
  static get BRAND_IDIOMAS_ALIASES()   { return window.BrandSchema.BRAND_IDIOMAS_ALIASES; }
  static get BRAND_MERCADO_OPTIONS()   { return window.BrandSchema.BRAND_MERCADO_OPTIONS; }
  static get BRAND_SUB_NICHOS_OPTIONS(){ return window.BrandSchema.BRAND_SUB_NICHOS_OPTIONS; }
  static get BRAND_ARRAY_FIELDS()      { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_CONTAINER, 'array'); }
  static get BRAND_JSON_FIELDS()       { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_CONTAINER, 'json'); }
  static get BRAND_TEXT_FIELDS()       { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_CONTAINER, 'text'); }
  static get BRAND_TEXTAREA_FIELDS()   { return window.BrandSchema.fieldsByType(window.BrandSchema.BRAND_SCHEMA_BLOCKS_CONTAINER, 'textarea'); }
  static get TYPOGRAPHY_FONTS()        { return window.BrandSchema.TYPOGRAPHY_FONTS; }

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

  /** Publica en :root el degradado a partir de this.brandColors (para CSS var en la galería). */
  _syncRootGradientFromBrandColors() {
    const hexes = this.getBrandColorsHexArray();
    const root = document.documentElement;
    if (!hexes.length || !window.BrandColors || typeof this.buildBrandGradientCss !== 'function') return;
    try {
      const brandGradient = this.buildBrandGradientCss(hexes);
      root.style.setProperty('--brand-gradient-dynamic', brandGradient);
      root.style.setProperty('--brand-gradient-dynamic-vertical', this.buildBrandGradientCss(hexes, 180));
    } catch (_) {
      /* sin BrandColors en edge cases */
    }
  }

  /** Hexes para degradado: filas locales o último tema de org (OrgBrandTheme). */
  _getGradientHexesForBackground() {
    let hexes = this.getBrandColorsHexArray();
    if (hexes.length) return hexes;
    if (window.OrgBrandTheme && typeof window.OrgBrandTheme.getLastBrandHexes === 'function') {
      const fromTheme = window.OrgBrandTheme.getLastBrandHexes();
      if (Array.isArray(fromTheme) && fromTheme.length) return fromTheme.slice(0, 4);
    }
    return [];
  }

  // Color utils ahora viven en /js/utils/brand-colors.js (fuente única para los 5
  // archivos que antes duplicaban hexToHSL/hslToHex/hexToRgba). Aliases de instancia
  // para no romper llamadas `this.hexToX()` dispersas por la vista.
  hexToRgba(hex, alpha = 1)          { return window.BrandColors.hexToRgba(hex, alpha); }
  hexToHSL(hex)                      { return window.BrandColors.hexToHSL(hex); }
  hslToHex(h, s, l)                  { return window.BrandColors.hslToHex(h, s, l); }
  filterAndScoreBrandColors(hexes)   { return window.BrandColors.filterAndScoreBrandColors(hexes); }
  getBrandUIPalette(brandColors)     { return window.BrandColors.getBrandUIPalette(brandColors); }
  buildBrandGradientCss(hexes, angle = 135) { return window.BrandColors.buildBrandGradientCss(hexes, angle); }

  /** Tras cambiar colores: actualiza degradado de fondo, glass de cards y acentos. */
  _refreshBrandStorageVisualChrome() {
    this._cachedGradientKey = null;
    this.applyBrandBackgroundGradient(true);
  }

  /** Hook llamado por ColorEditor.mixin.js tras cada cambio de color. */
  _refreshVisualChrome() {
    this._refreshBrandStorageVisualChrome();
  }

  /** Aplica el degradado de colores de marca al fondo (skeleton hace crossfade a esta capa). Sin colores usa neutro. */
  applyBrandBackgroundGradient(forceUpdate = false) {
    const appEl = this.container || document.getElementById('app-container');
    const brandsRoot = (appEl && appEl.querySelector('#brandsListContainer')) || document.getElementById('brandsListContainer');
    const gradientEl = brandsRoot && brandsRoot.querySelector('.background-gradient');
    const hexes = this._getGradientHexesForBackground();
    const root = document.documentElement;
    const rootGradRaw = (getComputedStyle(root).getPropertyValue('--brand-gradient-dynamic') || '').trim();
    const colorsKey = hexes.length
      ? hexes.join(',')
      : (rootGradRaw ? `root:${rootGradRaw.slice(0, 120)}` : '');
    if (!forceUpdate && this._cachedGradientKey === colorsKey) return;
    this._cachedGradientKey = colorsKey;

    const neutralBg = 'linear-gradient(145deg, #2d2a28 0%, #1f1d1b 50%, #252220 100%)';
    if (hexes.length) {
      const brandGradient = this.buildBrandGradientCss(hexes);
      if (gradientEl) {
        gradientEl.style.background = `${brandGradient}, ${neutralBg}`;
        gradientEl.setAttribute('data-brand-gradient', 'true');
      }
      root.style.setProperty('--brand-gradient-dynamic', brandGradient);
      root.style.setProperty('--brand-gradient-dynamic-vertical', this.buildBrandGradientCss(hexes, 180));
      this.applyBrandPrimaryBrillo();
    } else if (rootGradRaw && rootGradRaw !== 'none') {
      if (gradientEl) {
        gradientEl.style.background = `${rootGradRaw}, ${neutralBg}`;
        gradientEl.setAttribute('data-brand-gradient', 'true');
      }
    } else {
      if (gradientEl) {
        gradientEl.style.background = neutralBg;
        gradientEl.removeAttribute('data-brand-gradient');
      }
      this.resetBrandPrimaryBrillo();
    }
    this.applyBrandCardsGlassVariant();
  }

  /** Degradado + glass + clase para mostrar la capa .background-gradient (opacity en CSS). */
  _syncBrandStorageBackgroundChrome() {
    this.applyBrandBackgroundGradient(true);
    const appEl = this.container || document.getElementById('app-container');
    const root = (appEl && appEl.querySelector('#brandsListContainer')) || document.getElementById('brandsListContainer');
    if (root) root.classList.add('brands-background-ready');
  }

  /**
   * Decide qué variante de glass usar en las cards de Brand:
   * - Fondo muy oscuro: usar glass-white para subir contraste.
   * - Muy claro/saturado o mixto/neutro: usar glass-black.
   */
  getBrandCardsGlassMode() {
    const hexes = this._getGradientHexesForBackground();
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
    const hexes = this._getGradientHexesForBackground();
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
    this._syncBrandStorageBackgroundChrome();
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
    this.renderBrandStorageLibrary();
    this.setupEventListeners();
  }

  getBrandContainerHref(id) {
    const orgId = window.currentOrgId || this.organizationRow?.id || this.brandContainerData?.organization_id;
    const orgName = (window.currentOrgName || this.organizationRow?.name || '').trim();
    if (orgId && orgName && typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(orgId, orgName);
      if (prefix) return `${prefix}/brand/${id}`;
    }
    return `/brand/${id}`;
  }

  /** Texto compacto de mercado objetivo para la tarjeta de galería. */
  formatMercadoObjetivoTile(item) {
    const raw = item?.mercado_objetivo;
    const arr = Array.isArray(raw) ? raw.filter((v) => v != null && String(v).trim() !== '') : [];
    let opts = [];
    try {
      opts = (window.BrandSchema && Array.isArray(window.BrandSchema.BRAND_MERCADO_OPTIONS))
        ? window.BrandSchema.BRAND_MERCADO_OPTIONS
        : [];
    } catch (_) {
      opts = [];
    }
    if (!arr.length) return 'Sin mercado definido';
    return arr
      .map((v) => {
        const s = String(v).trim();
        const opt = opts.find((o) => (typeof o === 'string' ? o === s : String(o?.value ?? '') === s));
        if (typeof opt === 'string') return opt;
        if (opt && typeof opt === 'object') return String(opt.label || opt.value || '').trim();
        return s;
      })
      .filter(Boolean)
      .join(' · ');
  }

  getProductionCountForContainer(containerId) {
    const k = String(containerId || '');
    if (!k) return 0;
    return Number(this._productionCountsByContainerId[k] || 0);
  }

  renderBrandStorageLibrary() {
    const grid = (this.container && this.container.querySelector('#brandStorageGrid')) ||
      document.getElementById('brandStorageGrid');
    const countEl = (this.container && this.container.querySelector('#brandStorageCount')) ||
      document.getElementById('brandStorageCount');
    if (!grid) return;

    const rows = Array.isArray(this.brandContainers)
      ? [...this.brandContainers].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          if (tb !== ta) return tb - ta;
          return String(a.nombre_marca || '').localeCompare(String(b.nombre_marca || ''), 'es', { sensitivity: 'base' });
        })
      : [];
    if (countEl) countEl.textContent = String(rows.length);

    if (!rows.length) {
      grid.innerHTML = '<div class="brand-storage-empty">No tienes marcas todavía.</div>';
      return;
    }

    grid.innerHTML = rows.map((item) => {
      const name = this.escapeHtml(item.nombre_marca || 'Sin nombre');
      const mercado = this.escapeHtml(this.formatMercadoObjetivoTile(item));
      const updatedRaw = item.updated_at
        ? new Date(item.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const updatedLine = updatedRaw
        ? `Última actualización: ${this.escapeHtml(updatedRaw)}`
        : 'Sin actualizaciones';
      const prods = this.getProductionCountForContainer(item.id);
      const prodsStr = this.escapeHtml(String(prods));

      return `
        <button type="button" class="brand-card brand-storage-tile" data-brand-container-id="${this.escapeHtml(item.id)}" aria-label="Ver información de ${name}">
          <div class="brand-storage-tile__head">
            <div class="brand-storage-tile__name">${name}</div>
            <div class="brand-storage-tile__mercado">${mercado}</div>
          </div>
          <div class="brand-storage-tile__bottom">
            <div class="brand-storage-tile__prods" aria-label="Producciones">
              <span class="brand-storage-tile__prods-num">${prodsStr}</span>
              <span class="brand-storage-tile__prods-label">Producciones</span>
            </div>
            <div class="brand-storage-tile__updated">${updatedLine}</div>
          </div>
        </button>
      `;
    }).join('');

    if (typeof this.updateLinksForRouter === 'function') {
      this.updateLinksForRouter();
    }
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
            ${e.price != null ? `<span class="entity-price">${e.price} ${this.escapeHtml(e.currency || 'USD')}</span>` : ''}
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
      if (error) { console.error('BrandstorageView addPlace:', error); alert('Error al agregar el lugar.'); return; }
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
    if (error) { console.error('BrandstorageView createEntity:', error); alert('Error al crear la entidad.'); return; }
    this.brandEntities = [...(this.brandEntities || []), data];
    document.getElementById('brandEntityModal')?.remove();
    this.renderBrandEntities();
  }

  async deleteEntity(entityId) {
    if (!confirm('¿Eliminar esta entidad? Se eliminarán también sus vínculos con productos y servicios.')) return;
    if (!this.supabase || !entityId) return;

    const { error } = await this.supabase.from('brand_entities').delete().eq('id', entityId);
    if (error) { console.error('BrandstorageView deleteEntity:', error); alert('Error al eliminar.'); return; }
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
  // Editor de color (modal) + CRUD de brand_colors: extraídos a
  //   /js/views/brandstorage/ColorEditor.mixin.js
  //   (openColorEditor, updateColor, pickNextColorRole, createColor, deleteColor).

  /** Devuelve la fuente de tipografía actual (para imágenes) desde brand_fonts (font_usage = 'images'). */
  // Tipografía para imágenes: métodos extraídos a /js/views/brandstorage/Typography.mixin.js
  //   (getTypographyFontFamily, loadFontForPreview, loadAllTypographyFonts,
  //    renderTypography, saveTypographyForImages).
  // Se aplican sobre el prototype vía Object.assign al cargar el mixin.

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
    
    container.querySelectorAll('.brand-storage-tile').forEach((itemEl) => {
      if (itemEl.dataset.infoClickBound === '1') return;
      itemEl.dataset.infoClickBound = '1';
      itemEl.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(itemEl.getAttribute('data-brand-container-id') || '').trim();
        if (!id) return;
        this.openBrandContainerInfoPanel(id);
      });
    });
  }

  formatInfoDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  renderInfoTags(values, fallback = 'Sin datos') {
    const list = Array.isArray(values) ? values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean) : [];
    if (!list.length) {
      return `<span class="brand-storage-info-empty">${this.escapeHtml(fallback)}</span>`;
    }
    return list.map((value) => `<span class="brand-storage-info-tag">${this.escapeHtml(value)}</span>`).join('');
  }

  renderInfoJson(value) {
    if (!value || typeof value !== 'object') {
      return '<span class="brand-storage-info-empty">Sin datos</span>';
    }
    const entries = Object.entries(value).filter(([, v]) => v != null && String(v).trim() !== '');
    if (!entries.length) return '<span class="brand-storage-info-empty">Sin datos</span>';
    return `<pre class="brand-storage-info-json">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }

  getBrandArrayFieldOptions(fieldName) {
    if (fieldName === 'idiomas_contenido') return BrandstorageView.BRAND_IDIOMAS_OPTIONS;
    if (fieldName === 'mercado_objetivo') return BrandstorageView.BRAND_MERCADO_OPTIONS;
    if (fieldName === 'sub_nichos') return BrandstorageView.BRAND_SUB_NICHOS_OPTIONS;
    return [];
  }

  normalizeBrandArrayValues(fieldName, rawValues) {
    const values = Array.isArray(rawValues) ? rawValues : [];
    const normalized = values
      .map((v) => String(v).trim())
      .filter(Boolean)
      .map((value) => {
        if (fieldName !== 'idiomas_contenido') return value;
        const key = value.toLowerCase();
        return BrandstorageView.BRAND_IDIOMAS_ALIASES[key] || key;
      });
    return Array.from(new Set(normalized));
  }

  getBrandArrayOptionEntries(fieldName, rawValues) {
    const baseOptions = this.getBrandArrayFieldOptions(fieldName) || [];
    const entries = baseOptions.map((option) => {
      if (typeof option === 'string') return { value: option, label: option };
      return {
        value: String(option?.value ?? '').trim(),
        label: String(option?.label ?? option?.value ?? '').trim()
      };
    }).filter((entry) => entry.value);

    const selectedValues = this.normalizeBrandArrayValues(fieldName, rawValues);
    const map = new Map(entries.map((entry) => [entry.value, entry]));
    selectedValues.forEach((value) => {
      if (!map.has(value)) map.set(value, { value, label: this.getBrandArrayValueLabel(fieldName, value) });
    });
    return Array.from(map.values());
  }

  getBrandArrayValueLabel(fieldName, value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    if (fieldName === 'idiomas_contenido') {
      const match = BrandstorageView.BRAND_IDIOMAS_OPTIONS.find((opt) => String(opt.value) === normalized);
      if (match) return match.label;
    }
    return normalized;
  }

  renderBrandArrayMultiSelect(fieldName, rawValues) {
    const selected = this.normalizeBrandArrayValues(fieldName, rawValues);
    const options = this.getBrandArrayOptionEntries(fieldName, selected);
    const selectedSet = new Set(selected);
    const selectedLabel = selected.length
      ? selected
          .map((value) => `
            <span class="info-brand-multiselect__chip">
              <span class="info-brand-multiselect__chip-label">${this.escapeHtml(this.getBrandArrayValueLabel(fieldName, value))}</span>
              <button type="button" class="info-brand-multiselect__chip-remove" data-value="${this.escapeHtml(value)}" aria-label="Quitar ${this.escapeHtml(this.getBrandArrayValueLabel(fieldName, value))}">×</button>
            </span>
          `)
          .join('')
      : '<span class="info-brand-multiselect__placeholder">Seleccionar</span>';
    const optionsHtml = options.map((option) => {
      const optionValue = String(option.value || '');
      const optionLabel = String(option.label || optionValue);
      const isSelected = selectedSet.has(optionValue);
      return `
        <button type="button" class="info-brand-multiselect__option ${isSelected ? 'is-selected' : ''}" data-value="${this.escapeHtml(optionValue)}">
          <span class="info-brand-multiselect__check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
          <span>${this.escapeHtml(optionLabel)}</span>
        </button>
      `;
    }).join('');
    return `
      <div class="info-brand-multiselect" data-brand-field="${this.escapeHtml(fieldName)}" data-brand-input-type="array-multiselect" data-selected='${this.escapeHtml(JSON.stringify(selected))}'>
        <div class="info-brand-multiselect__trigger" role="button" tabindex="0" aria-expanded="false">
          <span class="info-brand-multiselect__value">${selectedLabel}</span>
          <span class="info-brand-multiselect__caret" aria-hidden="true"></span>
        </div>
        <div class="info-brand-multiselect__panel" hidden>
          ${optionsHtml}
        </div>
      </div>
    `;
  }

  renderBrandSingleSelect(fieldName, rawValue, options) {
    const normalized = rawValue == null ? '' : String(rawValue);
    const currentLabel = fieldName === 'nicho_core'
      ? BrandstorageView.getNichoCoreLabel(normalized)
      : (normalized || 'Seleccionar');
    const optionsHtml = (options || []).map((opt) => {
      const value = String(opt?.value ?? '');
      const label = String(opt?.label ?? value);
      const isSelected = value === normalized;
      return `
        <button type="button" class="info-brand-single-select__option ${isSelected ? 'is-selected' : ''}" data-value="${this.escapeHtml(value)}">
          <span class="info-brand-single-select__check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
          <span>${this.escapeHtml(label)}</span>
        </button>
      `;
    }).join('');
    return `
      <div class="info-brand-single-select" data-brand-field="${this.escapeHtml(fieldName)}" data-brand-input-type="single-select" data-selected="${this.escapeHtml(normalized)}">
        <button type="button" class="info-brand-single-select__trigger" aria-expanded="false">
          <span class="info-brand-single-select__value">${this.escapeHtml(currentLabel)}</span>
          <span class="info-brand-single-select__caret" aria-hidden="true"></span>
        </button>
        <div class="info-brand-single-select__panel" hidden>
          ${optionsHtml}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Info panel (SUB-MARCA + ORGANIZACIÓN): extraído a
  //   /js/views/brandstorage/InfoPanel.mixin.js
  //
  // Métodos movidos (se aplican sobre el prototype al cargar el mixin):
  //   · Accesores por container: getIntegrationsForContainer,
  //     getCampaignsForContainer, getAudiencesForContainer,
  //     getEntitiesForContainer, getOrgDashboardHref.
  //   · Integraciones OAuth: _pickBrandIntegrationForContainer,
  //     _integrationTokenExpired, _integrationUsable,
  //     buildInfoIntegrationRows, renderIntegrationsSection,
  //     startBrandIntegrationOAuth, disconnectBrandIntegration,
  //     saveBrandIntegrationField.
  //   · Panel SUB-MARCA: renderBrandReadonlySchema, renderCampaignsSection,
  //     renderAudiencesSection, renderEntitiesSection,
  //     renderBrandContainerInfoContent, openBrandContainerInfoPanel,
  //     closeBrandContainerInfoPanel, saveBrandContainerFieldById,
  //     saveBrandEntityField, setupBrandContainerInfoPanelEditables.
  //   · Panel ORG: openInfoPanel, closeInfoPanel, _refreshInfoPanelIfOpen,
  //     renderInfoAssetsSectionHtml, renderBrandSchemaAsideHtml,
  //     renderInfoPanelContent, setupInfoPanelEditables,
  //     _normalizeBrandFieldForDb, setupInfoBrandFieldEditors,
  //     _bindInfoBrandNichoSelect.
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
          console.warn('BrandstorageView: campo organizations no soportado:', fieldName);
        } else {
          await this._patchOrganization({ [fieldName]: value || null });
        }
      }
    } catch (error) {
      console.error(`BrandstorageView saveContainerField ${fieldName}:`, error);
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
      console.error('BrandstorageView saveBrandField:', error);
      alert(`Error al guardar ${fieldName}.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  // Subida de archivos: métodos extraídos a /js/views/brandstorage/Uploads.mixin.js
  //   (uploadLogo, uploadAsset, uploadIdentityFile, removeAsset,
  //    _extractStoragePathFromUrl, setupIdentityUpload, setupAssetsUpload).
  // Se aplican sobre el prototype vía Object.assign al cargar el mixin.

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

  // setupIdentityUpload / setupAssetsUpload también viven en Uploads.mixin.js.
}

window.BrandstorageView = BrandstorageView;
['__applyTypographyMixinToBrandViews', '__applyUploadsMixinToBrandViews', '__applyColorEditorMixinToBrandViews'].forEach((k) => {
  if (typeof window[k] === 'function') window[k]();
});
