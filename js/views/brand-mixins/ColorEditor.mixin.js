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
      const initialHex = color
        ? (color.hex_value || color.hex_code || color.hex || '#888888')
        : '#888888';
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
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        console.error('❌ Error al actualizar color:', error);
        alert('Error al actualizar el color. Por favor, intenta de nuevo.');
      }
    },

    /** Elige un color_role que no esté ya usado (para respetar UNIQUE(brand_id, color_role)). */
    pickNextColorRole(existingColors) {
      const roleLabels = ['Color', 'Color 2', 'Color 3', 'Color 4'];
      const usedRoles = new Set((existingColors || []).map(c => (c.color_role || '').trim()));
      const next = roleLabels.find(r => !usedRoles.has(r));
      return next || `Color ${(existingColors || []).length + 1}`;
    },

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
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        const isDuplicate = (error?.code === '23505') || (error?.message || '').includes('duplicate key');
        console.error('❌ Error al crear color:', error);
        if (isDuplicate) {
          alert('Este color ya existe en la marca. Elige otro valor.');
        } else {
          alert('Error al agregar el color. Por favor, intenta de nuevo.');
        }
      }
    },

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
        if (typeof this._refreshVisualChrome === 'function') this._refreshVisualChrome();
      } catch (error) {
        console.error('❌ Error al eliminar color:', error);
        alert('Error al eliminar color. Por favor, intenta de nuevo.');
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
