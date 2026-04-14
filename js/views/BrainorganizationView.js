/**
 * BrainorganizationView — Copia de la experiencia Brand a nivel organización (no brand_container).
 * Carga `organizations` como fuente principal; colores/fuentes/entidades por `organization_id`;
 * escrituras a `organizations` y `brand_assets` sin `brand_container_id` donde aplica.
 */
class BrainorganizationView extends BrandsView {
  constructor() {
    super();
    /** @type {boolean} */
    this._organizationBrainView = true;
    /** Fila real de organizations (persistencia). */
    this._organizationRow = null;
  }

  renderHTML() {
    const base = super.renderHTML();
    return base.replace(
      '<div class="brand-dashboard-container" id="brandsListContainer">',
      '<div class="brand-dashboard-container brain-organization-view" id="brandsListContainer" data-brain-org="1">'
    );
  }

  async updateHeader() {
    await super.updateHeader();
    const name =
      (this._organizationRow?.brand_name_oficial || this._organizationRow?.name || '').trim() ||
      (this.brandContainerData?.nombre_marca || '').trim() ||
      'Organización';
    this.updateHeaderContext('Brain', name);
  }

  /**
   * Datos anclados a `organizations` y recursos por `organization_id` (sin resolver brand_container).
   */
  async loadData() {
    if (!this.supabase || !this.userId) {
      this._dataLoaded = true;
      return;
    }

    const orgId = typeof window !== 'undefined' ? window.currentOrgId : null;
    if (!orgId) {
      this._organizationRow = null;
      this.brandContainerData = null;
      this.brandData = null;
      this._dataLoaded = true;
      if (this.isActive) this._refreshInfoPanelIfOpen();
      return;
    }

    try {
      const { data: org, error: orgErr } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();

      if (orgErr && orgErr.code !== 'PGRST116') {
        console.warn('BrainorganizationView: error cargando organizations', orgErr);
      }

      if (!org) {
        this._organizationRow = null;
        this.brandContainerData = null;
        this.brandData = null;
        this._dataLoaded = true;
        if (this.isActive) this._refreshInfoPanelIfOpen();
        return;
      }

      this._organizationRow = org;

      const displayName = (org.brand_name_oficial || org.name || 'Organización').trim();

      this.brandContainerData = {
        id: null,
        organization_id: orgId,
        nombre_marca: displayName,
        mercado_objetivo: [],
        idiomas_contenido: [],
        logo_url: org.logo_url || null,
        verbal_dna: {},
        visual_dna: {},
        nicho_core: org.brand_slogan || null,
        sub_nichos: [],
        arquetipo: null,
        propuesta_valor: null,
        mision_vision: null,
        palabras_clave: [],
        palabras_prohibidas: [],
        objetivos_estrategicos: [],
        updated_at: org.updated_at || null
      };
      this.brandData = this.brandContainerData;
      this.brandIntegrations = [];
      this.brandAudiences = [];

      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(5);
      if (productsError) {
        console.warn('BrainorganizationView: productos', productsError);
        this.products = [];
      } else {
        this.products = products || [];
      }

      const { data: assets, error: assetsError } = await this.supabase
        .from('brand_assets')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (assetsError) {
        console.warn('BrainorganizationView: brand_assets', assetsError);
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
        console.warn('BrainorganizationView: brand_entities', entitiesError);
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
            console.warn('BrainorganizationView: brand_places', placesError);
            this.brandPlaces = [];
          } else {
            this.brandPlaces = places || [];
          }
        } else {
          this.brandPlaces = [];
        }
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
        console.warn('BrainorganizationView: bloque organización', e);
        this.organizationMembers = [];
        this.organizationCredits = { credits_available: 100 };
        this.creditUsage = [];
      }
    } catch (error) {
      console.error('BrainorganizationView loadData:', error);
    } finally {
      this._dataLoaded = true;
      if (this.isActive) this._refreshInfoPanelIfOpen();
    }
  }

  /** Recarga assets por `organization_id` (sin `brand_container_id`). */
  async _reloadAssets() {
    if (this._organizationBrainView && this.supabase && this._organizationRow?.id) {
      const { data } = await this.supabase
        .from('brand_assets')
        .select('*')
        .eq('organization_id', this._organizationRow.id)
        .order('created_at', { ascending: false })
        .limit(5);
      this.brandAssets = data || [];
      return;
    }
    return super._reloadAssets();
  }

  async saveContainerField(fieldName, value) {
    if (!this._organizationBrainView) return super.saveContainerField(fieldName, value);
    const allowed = ['logo_url', 'name', 'brand_name_oficial', 'brand_slogan'];
    if (!allowed.includes(fieldName)) {
      console.warn('[BrainorganizationView] Campo organizations no soportado:', fieldName);
      return;
    }
    if (!this.supabase || !this._organizationRow?.id) return;

    const saveKey = `org_${fieldName}`;
    if (this.savingFields.has(saveKey)) return;
    this.savingFields.add(saveKey);
    try {
      const { error } = await this.supabase
        .from('organizations')
        .update({ [fieldName]: value || null })
        .eq('id', this._organizationRow.id);
      if (error) throw error;
      this._organizationRow[fieldName] = value || null;
      if (fieldName === 'logo_url') this.brandContainerData.logo_url = value || null;
      if (fieldName === 'brand_name_oficial' || fieldName === 'name') {
        this.brandContainerData.nombre_marca =
          (this._organizationRow.brand_name_oficial || this._organizationRow.name || '').trim() || 'Organización';
      }
      if (fieldName === 'brand_slogan') {
        this.brandContainerData.nicho_core = value || null;
      }
    } catch (error) {
      console.error('[BrainorganizationView] saveContainerField', error);
      alert(`Error al guardar ${fieldName}.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  async saveBrandField(fieldName, value) {
    if (!this._organizationBrainView) return super.saveBrandField(fieldName, value);
    if (!this.supabase || !this._organizationRow?.id) return;

    const textMap = {
      nombre_marca: 'brand_name_oficial',
      nicho_core: 'brand_slogan'
    };
    const orgColumn = textMap[fieldName];
    if (!orgColumn) {
      return;
    }

    const saveKey = `org_brand_${fieldName}`;
    if (this.savingFields.has(saveKey)) return;
    this.savingFields.add(saveKey);

    let v = value;
    if (BrandsView.BRAND_ARRAY_FIELDS.includes(fieldName) && typeof v === 'string') {
      v = v.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
    const payloadValue = this._normalizeBrandFieldForDb(fieldName, v);
    const strForOrg =
      orgColumn === 'brand_name_oficial'
        ? String(payloadValue != null ? payloadValue : '').trim()
        : String(payloadValue != null ? payloadValue : '');

    try {
      const { error } = await this.supabase
        .from('organizations')
        .update({ [orgColumn]: strForOrg || null })
        .eq('id', this._organizationRow.id);
      if (error) throw error;
      this._organizationRow[orgColumn] = strForOrg || null;
      if (fieldName === 'nombre_marca') {
        this.brandContainerData.nombre_marca =
          (this._organizationRow.brand_name_oficial || this._organizationRow.name || '').trim() || 'Organización';
      } else {
        this.brandContainerData[fieldName] = payloadValue;
      }
      this.brandData = this.brandContainerData;
    } catch (error) {
      console.error('[BrainorganizationView] saveBrandField', error);
      alert(`Error al guardar ${fieldName}.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  async uploadLogo(file) {
    if (!this._organizationBrainView) return super.uploadLogo(file);
    if (!file || !this._organizationRow?.id) return;
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
      const fileName = `org_logo_${this._organizationRow.id}_${Date.now()}.${fileExt}`;
      const filePath = `organizations/${this._organizationRow.id}/${fileName}`;
      const bucket = 'brand-logos';

      const { error: uploadError } = await this.supabase.storage.from(bucket).upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
      await this.saveContainerField('logo_url', publicUrl);
      this.brandContainerData.logo_url = publicUrl;
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
      console.error('[BrainorganizationView] uploadLogo', error);
      alert('Error al subir logo.');
    } finally {
      if (logoWrap) {
        logoWrap.style.pointerEvents = '';
        logoWrap.style.opacity = '';
      }
    }
  }

  async uploadAsset(file) {
    if (!this._organizationBrainView) return super.uploadAsset(file);
    if (!this.supabase || !this._organizationRow?.id) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `org_asset_${this._organizationRow.id}_${Date.now()}.${fileExt}`;
      const filePath = `organizations/${this._organizationRow.id}/assets/${fileName}`;

      const { error: uploadError } = await this.supabase.storage.from('brand-core').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = this.supabase.storage.from('brand-core').getPublicUrl(filePath);

      const { error: insertError } = await this.supabase.from('brand_assets').insert({
        organization_id: this._organizationRow.id,
        brand_container_id: null,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
        asset_scope: 'organization'
      });
      if (insertError) throw insertError;

      await this._reloadAssets();
      this.renderIdentityFiles();
    } catch (error) {
      console.error('[BrainorganizationView] uploadAsset', error);
      alert('Error al subir archivo.');
    }
  }
}

window.BrainorganizationView = BrainorganizationView;
