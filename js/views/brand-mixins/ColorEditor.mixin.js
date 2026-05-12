/**
 * Shared ColorEditor mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Modal de edición de color (rueda de tono + plano S/L + input multi-formato)
 * y su persistencia en `brand_colors` (create/update/delete). Usa las
 * utilidades puras de /js/utils/brand-colors.js para hex↔HSL.
 *
 * Tras cada cambio de color llama `this._refreshVisualChrome()` — cada vista
 * define ese hook para actualizar su propio chrome (gradiente, glass, brillo).
 *
 * Diseño técnico:
 *  - Handle del aro orbita via WRAPPER rotado (no se rota el handle propio).
 *  - Pointer Events + setPointerCapture → mouse/touch/pen unificados.
 *  - Drag throttleado con requestAnimationFrame.
 *  - Hex parser tolerante (#abc, abc, #aabbcc, RRGGBB) + parsers rgb()/hsl().
 *  - Keyboard: ←→ ±1°/±1%, ↑↓ ±5°/±5%, Enter aplica, Esc cierra.
 *  - ARIA: role="slider" + aria-valuemin/max/now en cada handle.
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined' && typeof BrandOrganizationView === 'undefined') {
    console.warn('[ColorEditor.mixin] ninguna vista de marca disponible; se aborta el mixin.');
    return;
  }

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  /** Acepta '#abc', 'abc', '#aabbcc', 'AABBCC' (con espacios). Devuelve '#RRGGBB' o null. */
  function parseHex(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    if (/^[0-9A-F]{6}$/.test(s)) return `#${s}`;
    return null;
  }

  /** Acepta 'rgb(r,g,b)' (con o sin espacios). Devuelve {r,g,b} o null. */
  function parseRgb(raw) {
    if (raw == null) return null;
    const m = String(raw).trim().match(/^rgba?\s*\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/].*)?\)$/i);
    if (!m) return null;
    const r = +m[1], g = +m[2], b = +m[3];
    if ([r, g, b].some((v) => v < 0 || v > 255)) return null;
    return { r, g, b };
  }

  /** Acepta 'hsl(h, s%, l%)' (% opcional). Devuelve {h,s,l} o null. */
  function parseHsl(raw) {
    if (raw == null) return null;
    const m = String(raw).trim().match(/^hsla?\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*(?:deg)?\s*[, ]\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*[, ]\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:[,/].*)?\)$/i);
    if (!m) return null;
    return { h: +m[1] % 360, s: clamp(+m[2], 0, 100), l: clamp(+m[3], 0, 100) };
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function formatHexDisplay(hex) {
    return hex.replace(/^#/, '').toUpperCase();
  }
  function formatRgbDisplay(hex) {
    const h = hex.replace(/^#/, '');
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  }
  function formatHslDisplay(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }

  const ColorEditorMixin = {
    openColorEditor(color) {
      const isNew = !color || !color.id;
      const incomingHex = color
        ? (color.hex_value || color.hex_code || color.hex || '#888888')
        : '#888888';
      const initialHex = parseHex(incomingHex) || '#888888';
      let { h, s, l } = this.hexToHSL(initialHex);
      const colorId = isNew ? null : color.id;
      const container = this.container || document.getElementById('app-container');
      if (!container) return;

      // ─── Modal & panel ────────────────────────────────────────────────
      const modal = document.createElement('div');
      modal.className = 'color-editor-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Editor de color');
      this._colorEditorModal = modal;

      const panel = document.createElement('div');
      panel.className = 'color-editor-panel';

      const wheelWrap = document.createElement('div');
      wheelWrap.className = 'color-editor-wheel-wrap';

      // ─── Hue ring + SL area (anidados visualmente) ────────────────────
      const hueRing = document.createElement('div');
      hueRing.className = 'color-editor-hue-ring';
      hueRing.setAttribute('aria-label', 'Rueda de tono');

      const slArea = document.createElement('div');
      slArea.className = 'color-editor-sl-area';

      const slHandle = document.createElement('div');
      slHandle.className = 'color-editor-sl-handle';
      slHandle.setAttribute('role', 'slider');
      slHandle.setAttribute('aria-label', 'Saturación y luminosidad');
      slHandle.setAttribute('aria-valuemin', '0');
      slHandle.setAttribute('aria-valuemax', '100');
      slHandle.setAttribute('tabindex', '0');

      // Wrapper orbital: este es el que rota. El hueHandle queda fijo en top.
      const hueHandleOrbit = document.createElement('div');
      hueHandleOrbit.className = 'color-editor-hue-handle-orbit';

      const hueHandle = document.createElement('div');
      hueHandle.className = 'color-editor-hue-handle';
      hueHandle.setAttribute('role', 'slider');
      hueHandle.setAttribute('aria-label', 'Matiz (hue)');
      hueHandle.setAttribute('aria-valuemin', '0');
      hueHandle.setAttribute('aria-valuemax', '359');
      hueHandle.setAttribute('tabindex', '0');

      // ─── Preview, hex input, format select ────────────────────────────
      const previewEl = document.createElement('div');
      previewEl.className = 'color-editor-current';

      const hexWrap = document.createElement('div');
      hexWrap.className = 'color-editor-hex-wrap';
      const hexInput = document.createElement('input');
      hexInput.type = 'text';
      hexInput.className = 'color-editor-hex-input';
      hexInput.setAttribute('spellcheck', 'false');
      hexInput.setAttribute('autocomplete', 'off');

      const formatSelect = document.createElement('select');
      formatSelect.className = 'color-editor-format';
      formatSelect.innerHTML = '<option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option>';

      // ─── Action buttons ───────────────────────────────────────────────
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

      // ─── State sync ───────────────────────────────────────────────────
      let rafPending = false;
      const scheduleSync = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          syncFromState();
        });
      };

      const syncFromState = () => {
        const hex = this.hslToHex(h, s, l);
        // Anillo: rotamos el ORBIT, no el handle.
        hueHandleOrbit.style.transform = `rotate(${h}deg)`;
        hueHandle.setAttribute('aria-valuenow', String(Math.round(h)));
        // SL handle: posición relativa al área SL. translate(-50%, -50%)
        // centra el handle (14px) sobre el punto S/L exacto.
        slHandle.style.left = `${s}%`;
        slHandle.style.top = `${100 - l}%`;
        slHandle.style.transform = 'translate(-50%, -50%)';
        slHandle.setAttribute('aria-valuenow', `${Math.round(s)},${Math.round(l)}`);
        slHandle.setAttribute('aria-valuetext', `Saturación ${Math.round(s)}%, luminosidad ${Math.round(l)}%`);
        // Gradiente del SL área (depende de h).
        slArea.style.background = `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
        previewEl.style.background = hex;
        // Hex input: solo actualizar si el input no está enfocado, para no
        // pisar al usuario mientras tipea.
        if (document.activeElement !== hexInput) {
          hexInput.value = renderInputForFormat(hex);
        }
      };

      const renderInputForFormat = (hex) => {
        if (formatSelect.value === 'rgb') return formatRgbDisplay(hex);
        if (formatSelect.value === 'hsl') return formatHslDisplay(h, s, l);
        return formatHexDisplay(hex);
      };

      // ─── Pointer drag helper ──────────────────────────────────────────
      const attachPointerDrag = (el, onMove) => {
        let active = false;
        const handleDown = (e) => {
          if (e.button != null && e.button !== 0) return; // solo botón izquierdo
          e.preventDefault();
          e.stopPropagation();
          active = true;
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          onMove(e);
        };
        const handleMove = (e) => {
          if (!active) return;
          e.preventDefault();
          e.stopPropagation();
          onMove(e);
        };
        const handleUp = (e) => {
          if (!active) return;
          active = false;
          try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        el.addEventListener('pointerdown', handleDown);
        el.addEventListener('pointermove', handleMove);
        el.addEventListener('pointerup', handleUp);
        el.addEventListener('pointercancel', handleUp);
        el.addEventListener('lostpointercapture', () => { active = false; });
      };

      // ─── Hue ring drag (mueve solo h) ─────────────────────────────────
      // El SL área hace stopPropagation, así que un pointerdown dentro del
      // SL nunca llega aquí. Una vez iniciado el drag en el aro, seguimos
      // actualizando h por el ángulo aunque el cursor cruce al centro.
      attachPointerDrag(hueRing, (e) => {
        const rect = hueRing.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        // atan2 da ángulo desde eje X (este); sumamos 90 para que 0=top.
        const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        h = ((angle % 360) + 360) % 360;
        scheduleSync();
      });

      // ─── SL drag (mueve s y l, bloquea bubble al aro) ─────────────────
      attachPointerDrag(slArea, (e) => {
        const rect = slArea.getBoundingClientRect();
        s = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
        l = clamp(100 - ((e.clientY - rect.top) / rect.height) * 100, 0, 100);
        scheduleSync();
      });

      // ─── Keyboard nav en handles ──────────────────────────────────────
      hueHandle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 5 : 1;
        let handled = true;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') h = ((h - step) + 360) % 360;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') h = (h + step) % 360;
        else if (e.key === 'Home') h = 0;
        else if (e.key === 'End') h = 359;
        else handled = false;
        if (handled) { e.preventDefault(); scheduleSync(); }
      });
      slHandle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 5 : 1;
        let handled = true;
        if (e.key === 'ArrowLeft')      s = clamp(s - step, 0, 100);
        else if (e.key === 'ArrowRight') s = clamp(s + step, 0, 100);
        else if (e.key === 'ArrowUp')    l = clamp(l + step, 0, 100);
        else if (e.key === 'ArrowDown')  l = clamp(l - step, 0, 100);
        else handled = false;
        if (handled) { e.preventDefault(); scheduleSync(); }
      });

      // ─── Hex/RGB/HSL input parser tolerante ───────────────────────────
      const tryConsumeInput = (raw) => {
        // Detectar formato y parsear.
        const trimmed = String(raw || '').trim();
        // hex con o sin #
        let hex = parseHex(trimmed);
        if (hex) {
          const hsl = this.hexToHSL(hex);
          h = hsl.h; s = hsl.s; l = hsl.l;
          return true;
        }
        const rgb = parseRgb(trimmed);
        if (rgb) {
          const hexFromRgb = rgbToHex(rgb.r, rgb.g, rgb.b);
          const hsl = this.hexToHSL(hexFromRgb);
          h = hsl.h; s = hsl.s; l = hsl.l;
          return true;
        }
        const hsl = parseHsl(trimmed);
        if (hsl) {
          h = hsl.h; s = hsl.s; l = hsl.l;
          return true;
        }
        return false;
      };

      hexInput.addEventListener('input', () => {
        // tryConsumeInput muta h/s/l; syncFromState ya skipea el input
        // enfocado, así no pisa lo que el usuario está tipeando.
        if (tryConsumeInput(hexInput.value)) scheduleSync();
      });
      hexInput.addEventListener('blur', () => {
        // Al perder foco, normalizar el display según el formato activo.
        hexInput.value = renderInputForFormat(this.hslToHex(h, s, l));
      });
      hexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyColor(); }
      });

      formatSelect.addEventListener('change', () => {
        hexInput.value = renderInputForFormat(this.hslToHex(h, s, l));
      });

      // ─── Apply / Cancel / Esc / backdrop ──────────────────────────────
      const closeEditor = () => {
        if (this._colorEditorModal && this._colorEditorModal.parentNode) {
          this._colorEditorModal.remove();
          this._colorEditorModal = null;
        }
        document.removeEventListener('keydown', onKeyDown);
      };
      const onKeyDown = (e) => { if (e.key === 'Escape') closeEditor(); };
      document.addEventListener('keydown', onKeyDown);

      const applyColor = async () => {
        const hexToSave = this.hslToHex(h, s, l);
        if (isNew) await this.createColor(hexToSave);
        else await this.updateColor(colorId, hexToSave);
        closeEditor();
      };

      applyBtn.addEventListener('click', applyColor);
      cancelBtn.addEventListener('click', closeEditor);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });

      // ─── DOM tree ─────────────────────────────────────────────────────
      hueHandleOrbit.appendChild(hueHandle);
      slArea.appendChild(slHandle);
      hueRing.appendChild(slArea);
      hueRing.appendChild(hueHandleOrbit);
      wheelWrap.appendChild(hueRing);
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

      // Estado inicial sincronizado.
      syncFromState();
      hexInput.value = renderInputForFormat(this.hslToHex(h, s, l));
      // Foco inicial al input para tipeo rápido.
      hexInput.focus();
      hexInput.select();
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
