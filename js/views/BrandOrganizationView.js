/**
 * BrandOrganizationView — misma experiencia visual que BrandsView, pero anclada a la fila
 * `organizations` del workspace activo (no a `brand_containers`). Colores, fuentes,
 * entidades y activos con alcance org siguen por `organization_id`.
 */
class BrandOrganizationView extends BrandsView {
  constructor() {
    super();
    /** @type {object|null} Fila `organizations` */
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
    const payload = { ...partial };
    const { error } = await this.supabase.from('organizations').update(payload).eq('id', orgId);
    if (error) throw error;
    this.organizationRow = { ...this.organizationRow, ...partial };
    this._mergeOrgIntoShim();
  }

  async updateHeader() {
    await super.updateHeader();
    const name =
      (this.organizationRow?.brand_name_oficial || this.organizationRow?.name || 'Organización').trim();
    this.updateHeaderContext('Marca organización', name);
  }

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
        this.brandIntegrations = [];
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
        this.brandIntegrations = [];
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
      this.brandIntegrations = [];

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

      const { data: entities, error: entitiesError } = await this.supabase
        .from('brand_entities')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });
      if (entitiesError) {
        console.warn('BrandOrganizationView: brand_entities', entitiesError);
        this.brandEntities = [];
        this.brandPlaces = [];
      } else {
        this.brandEntities = entities || [];
        if (this.brandEntities.length > 0) {
          const entityIds = this.brandEntities.map((e) => e.id);
          const { data: places, error: placesError } = await this.supabase
            .from('brand_places')
            .select('*')
            .in('entity_id', entityIds)
            .order('created_at', { ascending: true });
          if (placesError) {
            console.warn('BrandOrganizationView: brand_places', placesError);
            this.brandPlaces = [];
          } else {
            this.brandPlaces = places || [];
          }
        } else {
          this.brandPlaces = [];
        }
      }

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

  renderMarket() {
    const el = document.getElementById('brandMarketLabel');
    if (!el) return;
    el.removeAttribute('data-field');
    el.textContent = 'Workspace · identidad organizacional (sin contenedor de marca)';
    el.style.cursor = 'default';
    el.style.opacity = '0.72';
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
        <p class="info-brand-aside-lead">Datos del workspace. El detalle de nicho, DNA verbal/visual, etc. sigue en la vista <strong>Marca</strong> (contenedor).</p>
        <div class="info-brand-fields">
          ${blocks}
        </div>
      </div>
    `;
  }

  async saveContainerField(fieldName, value) {
    if (!this.supabase || !this.organizationRow) return;

    if (fieldName === 'nombre_marca') {
      const v = (value || '').trim() || null;
      await this._patchOrganization({ brand_name_oficial: v });
      return;
    }
    if (fieldName === 'mercado_objetivo') {
      return;
    }
    if (fieldName === 'logo_url') {
      await this._patchOrganization({ logo_url: value || null });
      return;
    }

    const allowed = new Set(['name', 'brand_name_oficial', 'brand_slogan', 'level_of_autonomy']);
    if (!allowed.has(fieldName)) {
      console.warn('BrandOrganizationView: campo organizations no soportado:', fieldName);
      return;
    }
    await this._patchOrganization({ [fieldName]: value || null });
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

      const { error: uploadError } = await this.supabase.storage.from(bucket).upload(filePath, file, { upsert: true });
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

      const insertPayload = {
        organization_id: orgId,
        asset_scope: 'organization',
        brand_container_id: null,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size
      };

      const { error: insertError } = await this.supabase.from('brand_assets').insert(insertPayload);
      if (insertError) throw insertError;

      await this._reloadAssets();
      this.renderIdentityFiles();
    } catch (error) {
      console.error('BrandOrganizationView uploadAsset:', error);
      alert('Error al subir archivo.');
    }
  }
}

window.BrandOrganizationView = BrandOrganizationView;
