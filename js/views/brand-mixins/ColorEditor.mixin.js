/**
 * Shared ColorEditor mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Wrapper fino sobre window.ColorPickerModal (js/components/ColorPickerModal.js).
 * El componente maneja UI/interacción/teclado/accesibilidad; este mixin solo
 * resuelve el hex inicial desde el row de brand_colors y persiste el resultado
 * en BD (create/update/delete).
 *
 * Tras cada cambio de color llama `this._refreshVisualChrome()` — cada vista
 * define ese hook para actualizar su propio chrome (gradiente, glass, brillo).
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined' && typeof BrandOrganizationView === 'undefined') {
    console.warn('[ColorEditor.mixin] ninguna vista de marca disponible; se aborta el mixin.');
    return;
  }

  const ColorEditorMixin = {
    openColorEditor(color) {
      if (!window.ColorPickerModal || typeof window.ColorPickerModal.open !== 'function') {
        console.error('[ColorEditor.mixin] window.ColorPickerModal no disponible. Cargar js/components/ColorPickerModal.js antes.');
        return;
      }
      const isNew = !color || !color.id;
      const colorId = isNew ? null : color.id;
      // Sin color guardado, el selector arranca en el gris neutro de la plataforma
      // (token --icon-button, leído en ejecución: el selector necesita un hex, no var()).
      let neutro = 'gray';
      try { neutro = getComputedStyle(document.documentElement).getPropertyValue('--icon-button').trim() || neutro; } catch (_) { /* sin estilos calculados */ }
      const initialHex = (color && (color.hex_value || color.hex_code || color.hex)) || neutro;
      const container = this.container || document.getElementById('app-container');
      window.ColorPickerModal.open({
        initialHex,
        container,
        onApply: async (hexToSave) => {
          if (isNew) await this.createColor(hexToSave);
          else await this.updateColor(colorId, hexToSave);
        },
      });
    },

    async updateColor(colorId, hexValue) {
      if (!window.MarcaDatos || !this.brandData) return;
      try {
        await window.MarcaDatos.actualizarColor(colorId, hexValue);
        await this._reloadColors();
        this.renderCards();
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        if (error?.code === 'hex_invalido') return;
        console.error('❌ Error al actualizar color:', error);
        window.showToast(__('Error al actualizar el color. Por favor, intenta de nuevo.'), { type: 'error' });
      }
    },

    async createColor(hexValue) {
      if (!window.MarcaDatos || !this.brandData) return;
      const orgId = this.brandContainerData?.organization_id;
      if (!orgId) return;
      try {
        // El servicio relee la base antes de insertar: tope de 4, duplicado y rol (UN primary).
        await window.MarcaDatos.crearColor(orgId, hexValue);
        await this._reloadColors();
        this.renderCards();
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        if (error?.code === 'hex_invalido') return;
        if (error?.code === 'tope') { window.showToast(__('Máximo 4 colores por marca.'), { type: 'warning' }); return; }
        const isDuplicate = (error?.code === '23505') || (error?.message || '').includes('duplicate key');
        console.error('❌ Error al crear color:', error);
        window.showToast(isDuplicate ? __('Este color ya existe en la marca. Elige otro valor.') : __('Error al agregar el color. Por favor, intenta de nuevo.'), { type: 'error' });
      }
    },

    async deleteColor(colorId) {
      if (!window.MarcaDatos) return;
      try {
        const borrado = await window.MarcaDatos.borrarColor(colorId);
        if (!borrado) throw Object.assign(new Error('La base no borró el color (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
        await this._reloadColors();
        this.renderCards();
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        console.error('❌ Error al eliminar color:', error);
        window.showToast(__('Error al eliminar color. Por favor, intenta de nuevo.'), { type: 'error' });
      }
    }
  };

  function applyColorEditorToBrandViews() {
    if (typeof BrandstorageView !== 'undefined') Object.assign(BrandstorageView.prototype, ColorEditorMixin);
    if (typeof BrandOrganizationView !== 'undefined') Object.assign(BrandOrganizationView.prototype, ColorEditorMixin);
  }
  applyColorEditorToBrandViews();
  window.__applyColorEditorMixinToBrandViews = applyColorEditorToBrandViews;
})();
