/**
 * BrandOrganizationView — Uploads mixin.
 *
 * Subida de logo, assets generales y archivos de identidad (indexados en
 * ai_brand_vectors) + wirings de los botones "Subir archivo". Equivalente al
 * mixin de BrandstorageView; unificable en un round futuro.
 *
 * Aplica sobre BrandOrganizationView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof BrandOrganizationView === 'undefined') {
    console.warn('[Uploads.mixin] BrandOrganizationView no disponible; se aborta el mixin.');
    return;
  }

  const UploadsMixin = {
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
    const logoWrap = container?.querySelector('.brand-corner-logo-btn') || container?.querySelector('.info-logo-container');
    if (logoWrap) {
      logoWrap.style.pointerEvents = 'none';
      logoWrap.style.opacity = '0.7';
    }
    try {
      const fileExt = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `org_logo_${orgId}_${Date.now()}.${fileExt}`;
      const filePath = `${orgId}/${fileName}`;
      const bucket = 'org-assets';

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
      this.renderCornerLogoUploader();
    } catch (error) {
      console.error('BrandOrganizationView uploadLogo:', error);
      alert('Error al subir logo.');
    } finally {
      if (logoWrap) {
        logoWrap.style.pointerEvents = '';
        logoWrap.style.opacity = '';
      }
    }
  },

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
        bucket: 'brand-core',
        storage_path: filePath,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size
      });

      if (insertError) throw insertError;

      await this._reloadAssets();
      this.renderAssetsFiles();
    } catch (error) {
      console.error('BrandOrganizationView uploadAsset:', error);
      alert('Error al subir archivo.');
    }
  },

  async uploadIdentityFile(file) {
    if (!this.supabase || !this.organizationRow) return;
    const orgId = this.organizationRow.id;
    try {
      const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase();
      const fileName = `identity_${orgId}_${Date.now()}.${fileExt}`;
      const filePath = `organizations/${orgId}/identity/${fileName}`;
      const bucket = 'brand-core';

      const { error: uploadError } = await this.supabase.storage.from(bucket).upload(filePath, file, {
        upsert: false,
        contentType: file.type || undefined
      });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl }
      } = this.supabase.storage.from(bucket).getPublicUrl(filePath);

      const { data: insertedAsset, error: insertError } = await this.supabase
        .from('brand_assets')
        .insert({
          organization_id: orgId,
          asset_scope: 'organization',
          asset_type: 'identity',
          brand_container_id: null,
          bucket,
          storage_path: filePath,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      // Registro base en ai_brand_vectors para que el pipeline de IA tenga fuente del archivo.
      // Si falla, no bloquea el upload del asset.
      const { error: vectorError } = await this.supabase.from('ai_brand_vectors').insert({
        organization_id: orgId,
        brand_container_id: null,
        source_bucket: bucket,
        source_path: filePath,
        source_type: file.type || 'file',
        chunk_index: 0,
        content: `Archivo de identidad: ${file.name}`,
        metadata: {
          asset_id: insertedAsset?.id || null,
          file_name: file.name,
          origin: 'brand-identity-upload',
          vector_status: 'pending'
        }
      });
      if (vectorError) {
        console.warn('BrandOrganizationView ai_brand_vectors:', vectorError);
      }

      await this._reloadAssets();
      this.renderIdentityFiles();
      this.renderAssetsFiles();
    } catch (error) {
      console.error('BrandOrganizationView uploadIdentityFile:', error);
      alert('Error al subir archivo de identidad.');
    }
  },

  async removeAsset(assetId) {
    if (!this.supabase || !assetId) return;
    const asset = (this.brandAssets || []).find((a) => a.id === assetId);
    if (!asset) return;
    if (!window.confirm('¿Eliminar este asset?')) return;

    try {
      const bucket = asset.bucket || 'brand-core';
      const storagePath = asset.storage_path || this._extractStoragePathFromUrl(asset.file_url, bucket);
      if (storagePath) {
        await this.supabase.storage.from(bucket).remove([storagePath]);
      }

      const { error } = await this.supabase.from('brand_assets').delete().eq('id', assetId);
      if (error) throw error;

      this.brandAssets = (this.brandAssets || []).filter((a) => a.id !== assetId);
      this.renderAssetsFiles();
    } catch (error) {
      console.error('BrandOrganizationView removeAsset:', error);
      alert('No se pudo eliminar el asset.');
    }
  },

  _extractStoragePathFromUrl(url, bucket) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = raw.indexOf(marker);
    if (idx >= 0) return raw.slice(idx + marker.length);
    return '';
  },

  // ============================================
  // MÉTODOS DE EDICIÓN INLINE
  setupIdentityUpload() {
    const container = document.getElementById('identityFilesContainer');
    if (!container) return;

    let uploadBtn = container.querySelector('.identity-upload-btn');
    if (!uploadBtn) {
      uploadBtn = document.createElement('button');
      uploadBtn.className = 'file-upload-btn identity-upload-btn';
      uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Subir archivo';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.multiple = true;
      fileInput.accept = 'image/*,application/pdf,.svg,.ai,.eps,.psd';
      fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach((file) => this.uploadIdentityFile(file));
        fileInput.value = '';
      });

      uploadBtn.addEventListener('click', () => fileInput.click());
      container.appendChild(fileInput);
      container.appendChild(uploadBtn);
    }
  },

  setupAssetsUpload() {
    const container = document.getElementById('assetsFilesContainer');
    if (!container) return;

    // Agregar botón de upload si no existe
    let uploadBtn = container.querySelector('.file-upload-btn');
    if (!uploadBtn) {
      uploadBtn = document.createElement('button');
      uploadBtn.className = 'file-upload-btn assets-upload-btn';
      uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Subir archivo';

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
  },
  };

  Object.assign(BrandOrganizationView.prototype, UploadsMixin);
})();
