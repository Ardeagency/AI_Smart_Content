/**
 * Shared Uploads mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Subida, inserción en `brand_assets` y borrado de archivos de marca:
 * logo de organización, identidad (indexada en `ai_brand_vectors`) y assets
 * generales. También expone los wirings de los botones "Subir archivo".
 *
 * Aplica sobre el prototype de ambas vistas de marca al cargarse.
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined' && typeof BrandOrganizationView === 'undefined') {
    console.warn('[Uploads.mixin] ninguna vista de marca disponible; se aborta el mixin.');
    return;
  }

  // Límites de tamaño de archivo (bytes). Supabase tiene sus propios límites de
  // bucket, pero validar en el cliente evita el upload innecesario + da feedback inmediato.
  const MAX_LOGO_SIZE     = 10 * 1024 * 1024;   // 10 MB
  const MAX_ASSET_SIZE    = 50 * 1024 * 1024;   // 50 MB
  const MAX_IDENTITY_SIZE = 50 * 1024 * 1024;   // 50 MB

  // Extensiones seguras permitidas por tipo de archivo.
  const ALLOWED_LOGO_EXT     = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
  const ALLOWED_ASSET_EXT    = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'mp4', 'mov', 'ai', 'eps', 'psd']);
  const ALLOWED_IDENTITY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'ai', 'eps', 'psd']);

  function _validateFile(file, maxSize, allowedExtensions, label) {
    if (!file) return 'Archivo no proporcionado.';
    if (file.size > maxSize) {
      return `El archivo "${file.name}" supera el tamaño máximo (${Math.round(maxSize / 1024 / 1024)} MB).`;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return `La extensión ".${ext}" no está permitida para ${label}. Formatos válidos: ${[...allowedExtensions].join(', ')}.`;
    }
    return null;
  }

  const UploadsMixin = {
    async uploadLogo(file) {
      if (!file || !this.organizationRow) return;
      const err = _validateFile(file, MAX_LOGO_SIZE, ALLOWED_LOGO_EXT, 'logo');
      if (err) { alert(err); return; }
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
        console.error('BrandstorageView uploadLogo:', error);
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
      const err = _validateFile(file, MAX_ASSET_SIZE, ALLOWED_ASSET_EXT, 'asset');
      if (err) { alert(err); return; }
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
        console.error('BrandstorageView uploadAsset:', error);
        alert('Error al subir archivo.');
      }
    },

    async uploadIdentityFile(file) {
      if (!this.supabase || !this.organizationRow) return;
      const err = _validateFile(file, MAX_IDENTITY_SIZE, ALLOWED_IDENTITY_EXT, 'archivo de identidad');
      if (err) { alert(err); return; }
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
          console.warn('BrandstorageView ai_brand_vectors:', vectorError);
        }

        await this._reloadAssets();
        this.renderIdentityFiles();
        this.renderAssetsFiles();
      } catch (error) {
        console.error('BrandstorageView uploadIdentityFile:', error);
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
        console.error('BrandstorageView removeAsset:', error);
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
    }
  };

  function applyUploadsToBrandViews() {
    if (typeof BrandstorageView !== 'undefined') Object.assign(BrandstorageView.prototype, UploadsMixin);
    if (typeof BrandOrganizationView !== 'undefined') Object.assign(BrandOrganizationView.prototype, UploadsMixin);
  }
  applyUploadsToBrandViews();
  window.__applyUploadsMixinToBrandViews = applyUploadsToBrandViews;
})();
