/**
 * Shared Uploads mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Subida, registro en `brand_assets` y borrado de archivos de marca: logo de
 * organización, identidad (documentos) y assets generales, todo por
 * MarcaDataService (el archivo viaja por POST /v1/archivos del borde; la
 * consola no tiene storage propio). También expone los wirings de los botones
 * "Subir archivo".
 *
 * Aplica sobre el prototype de ambas vistas de marca al cargarse.
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined' && typeof BrandOrganizationView === 'undefined') {
    console.warn('[Uploads.mixin] ninguna vista de marca disponible; se aborta el mixin.');
    return;
  }

  // Límites de tamaño de archivo (bytes). El borde admite 200 MB por archivo,
  // pero validar en el cliente evita el upload innecesario + da feedback inmediato.
  const MAX_LOGO_SIZE     = 10 * 1024 * 1024;   // 10 MB
  const MAX_ASSET_SIZE    = 50 * 1024 * 1024;   // 50 MB
  const MAX_IDENTITY_SIZE = 50 * 1024 * 1024;   // 50 MB

  // Extensiones seguras permitidas por tipo de archivo.
  // Identity = documentos (manuales de marca, brand books, calligraphy specs).
  // Assets   = piezas visuales (imagenes, video, archivos de diseño editables).
  const ALLOWED_LOGO_EXT     = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
  const ALLOWED_ASSET_EXT    = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mov', 'webm', 'ai', 'eps', 'psd']);
  const ALLOWED_IDENTITY_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'md', 'odt', 'odp', 'ods']);

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
    /** El logo sube por el borde (POST /v1/archivos) y la marca apunta a él (logo_file_id + logo_url). */
    async uploadLogo(file) {
      if (!file || !this.organizationRow) return;
      const err = _validateFile(file, MAX_LOGO_SIZE, ALLOWED_LOGO_EXT, 'logo');
      if (err) { alert(err); return; }
      if (!window.MarcaDatos) { alert(__('No se pudo conectar. Intenta de nuevo.')); return; }
      const orgId = this.organizationRow.id;
      const container = this.container || document.getElementById('app-container');
      const logoWrap = container?.querySelector('.brand-corner-logo-btn') || container?.querySelector('.info-logo-container');
      if (logoWrap) {
        logoWrap.style.pointerEvents = 'none';
        logoWrap.style.opacity = '0.7';
      }
      try {
        const asset = await window.MarcaDatos.subirAsset(orgId, file, { logo: true });
        const logoUrl = asset?.logo_url || asset?.file_url || null;
        this.organizationRow = { ...this.organizationRow, logo_url: logoUrl, logo_file_id: asset?.file_id || null };
        if (typeof this._mergeOrgIntoShim === 'function') this._mergeOrgIntoShim();
        if (this.brandContainerData) this.brandContainerData.logo_url = logoUrl;
        await this._reloadAssets();
        this.renderAll();
        this.renderCornerLogoUploader();
        if (window.contextoService?.cargar) window.contextoService.cargar({ fresco: true }).catch(() => {});
      } catch (error) {
        console.error('BrandOrganizationView uploadLogo:', error);
        alert(error?.code === 'sin_api' ? __('La subida de archivos aún no está disponible.') : __('Error al subir logo.'));
      } finally {
        if (logoWrap) {
          logoWrap.style.pointerEvents = '';
          logoWrap.style.opacity = '';
        }
      }
    },

    async uploadAsset(file) {
      if (!window.MarcaDatos || !this.organizationRow) return;
      const err = _validateFile(file, MAX_ASSET_SIZE, ALLOWED_ASSET_EXT, 'asset');
      if (err) { alert(err); return; }
      try {
        await window.MarcaDatos.subirAsset(this.organizationRow.id, file);
        await this._reloadAssets();
        this.renderAssetsFiles();
      } catch (error) {
        console.error('BrandOrganizationView uploadAsset:', error);
        alert(error?.code === 'sin_api' ? __('La subida de archivos aún no está disponible.') : __('Error al subir archivo.'));
      }
    },

    /** Identidad = documentos (kind document). El índice para la IA lo hace la base al recibir el archivo, no la consola. */
    async uploadIdentityFile(file) {
      if (!window.MarcaDatos || !this.organizationRow) return;
      const err = _validateFile(file, MAX_IDENTITY_SIZE, ALLOWED_IDENTITY_EXT, 'archivo de identidad');
      if (err) { alert(err); return; }
      try {
        await window.MarcaDatos.subirAsset(this.organizationRow.id, file, { identidad: true });
        await this._reloadAssets();
        this.renderIdentityFiles();
        this.renderAssetsFiles();
      } catch (error) {
        console.error('BrandOrganizationView uploadIdentityFile:', error);
        alert(error?.code === 'sin_api' ? __('La subida de archivos aún no está disponible.') : __('Error al subir archivo de identidad.'));
      }
    },

    async removeAsset(assetId) {
      if (!window.MarcaDatos || !assetId || !this.organizationRow) return;
      const asset = (this.brandAssets || []).find((a) => a.id === assetId);
      if (!asset) return;
      try {
        const borrado = await window.MarcaDatos.borrarAsset(this.organizationRow.id, asset);
        if (!borrado) throw Object.assign(new Error('La base no borró el asset (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
        this.brandAssets = (this.brandAssets || []).filter((a) => a.id !== assetId);
        // Re-rendear ambas cards: el asset borrado podia estar en cualquiera de las dos.
        if (typeof this.renderIdentityFiles === 'function') this.renderIdentityFiles();
        if (typeof this.renderAssetsFiles === 'function') this.renderAssetsFiles();
      } catch (error) {
        console.error('BrandOrganizationView removeAsset:', error);
        alert(__('No se pudo eliminar el archivo.'));
      }
    },

    /**
     * Bindea el boton + input estaticos de "Subir archivo de identidad".
     * Idempotente (data-flag). Los elementos deben venir del HTML de la vista
     * (renderHTML) — viven FUERA del subcontainer de lista para sobrevivir a
     * re-renders. Si la vista no los emite (legacy), no hace nada.
     */
    setupIdentityUpload() {
      const root = this.container || document;
      const uploadBtn = root.querySelector('#identityUploadBtn');
      const fileInput = root.querySelector('#identityFileInput');
      if (!uploadBtn || !fileInput) return;

      if (uploadBtn.dataset.identityUploadBound !== '1') {
        uploadBtn.dataset.identityUploadBound = '1';
        uploadBtn.addEventListener('click', () => fileInput.click());
      }
      if (fileInput.dataset.identityUploadBound !== '1') {
        fileInput.dataset.identityUploadBound = '1';
        fileInput.addEventListener('change', (e) => {
          Array.from(e.target.files).forEach((file) => this.uploadIdentityFile(file));
          fileInput.value = '';
        });
      }
    },

    /**
     * Bindea el boton + input estaticos de "Subir asset". Misma logica que el
     * de identity — controles permanentes en el HTML, no se crean dinamicamente.
     */
    setupAssetsUpload() {
      const root = this.container || document;
      const uploadBtn = root.querySelector('#assetsUploadBtn');
      const fileInput = root.querySelector('#assetsFileInput');
      if (!uploadBtn || !fileInput) return;

      if (uploadBtn.dataset.assetsUploadBound !== '1') {
        uploadBtn.dataset.assetsUploadBound = '1';
        uploadBtn.addEventListener('click', () => fileInput.click());
      }
      if (fileInput.dataset.assetsUploadBound !== '1') {
        fileInput.dataset.assetsUploadBound = '1';
        fileInput.addEventListener('change', (e) => {
          Array.from(e.target.files).forEach((file) => this.uploadAsset(file));
          fileInput.value = '';
        });
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
