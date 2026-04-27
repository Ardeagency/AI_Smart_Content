/**
 * Shared ColorEditor mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Modal de edición de color (rueda de tono + plano S/L + input hex) y su
 * persistencia en `brand_colors` (create/update/delete). Usa las utilidades
 * puras de /js/utils/brand-colors.js para hex↔HSL.
 *
 * Tras cada cambio de color llama `this._refreshVisualChrome()` — cada vista
 * define ese hook para actualizar su propio chrome (gradiente, glass, brillo).
 *
 * Aplica sobre el prototype de ambas vistas de marca al cargarse.
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined' && typeof BrandOrganizationView === 'undefined') {
    console.warn('[ColorEditor.mixin] ninguna vista de marca disponible; se aborta el mixin.');
    return;
  }

  const ColorEditorMixin = {
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
        console.log('✅ Color eliminado');
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
