/**
 * ColorPickerModal — componente puro y reutilizable.
 *
 * Single source of truth del color picker. Antes había dos copias casi
 * idénticas (js/views/brand-mixins/ColorEditor.mixin.js y
 * js/input-registry.js); este módulo centraliza la implementación y
 * ambos consumidores quedan como wrappers finos.
 *
 * Diseño:
 *  - Handle del aro orbita via wrapper rotado (.color-editor-hue-handle-orbit).
 *  - Pointer Events + setPointerCapture → mouse/touch/pen unificados.
 *  - Drag throttleado con requestAnimationFrame.
 *  - Parser de input tolerante: #abc, abc, #aabbcc, rgb(...), hsl(...).
 *  - Keyboard: ←→ ±1°/±1%, ↑↓ ±5° con Shift, Enter aplica, Esc cierra.
 *  - ARIA: role="slider" + aria-valuenow/min/max en cada handle.
 *
 * Dependencias globales:
 *  - window.BrandColors.hexToHSL / hslToHex (de js/utils/brand-colors.js).
 *
 * API pública:
 *  window.ColorPickerModal.open({ initialHex, onApply, container? })
 *
 * Parámetros:
 *  - initialHex {string}  Hex inicial. Acepta '#abc', '#aabbcc' o sin '#'.
 *  - onApply    {fn(hex)} Callback con el hex elegido al pulsar Aplicar.
 *  - container  {Element} Donde montar el modal. Default: #app-container.
 *
 * Retorna: { close } — handle para cerrar programáticamente.
 */
(function () {
  'use strict';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function parseHex(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    if (/^[0-9A-F]{6}$/.test(s)) return `#${s}`;
    return null;
  }

  function parseRgb(raw) {
    if (raw == null) return null;
    const m = String(raw).trim().match(/^rgba?\s*\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/].*)?\)$/i);
    if (!m) return null;
    const r = +m[1], g = +m[2], b = +m[3];
    if ([r, g, b].some((v) => v < 0 || v > 255)) return null;
    return { r, g, b };
  }

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

  function formatHexDisplay(hex) { return hex.replace(/^#/, '').toUpperCase(); }
  function formatRgbDisplay(hex) {
    const h = hex.replace(/^#/, '');
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  }
  function formatHslDisplay(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }

  function open({ initialHex, onApply, container } = {}) {
    const BC = window.BrandColors;
    if (!BC || typeof BC.hexToHSL !== 'function' || typeof BC.hslToHex !== 'function') {
      console.error('[ColorPickerModal] window.BrandColors no disponible. Cargar js/utils/brand-colors.js antes.');
      return { close: () => {} };
    }
    const root = container || document.getElementById('app-container') || document.body;
    const seedHex = parseHex(initialHex) || '#888888';
    let { h, s, l } = BC.hexToHSL(seedHex);

    // ─── Modal & panel ────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.className = 'color-editor-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Editor de color');

    const panel = document.createElement('div');
    panel.className = 'color-editor-panel';

    const wheelWrap = document.createElement('div');
    wheelWrap.className = 'color-editor-wheel-wrap';

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

    const hueHandleOrbit = document.createElement('div');
    hueHandleOrbit.className = 'color-editor-hue-handle-orbit';

    const hueHandle = document.createElement('div');
    hueHandle.className = 'color-editor-hue-handle';
    hueHandle.setAttribute('role', 'slider');
    hueHandle.setAttribute('aria-label', 'Matiz (hue)');
    hueHandle.setAttribute('aria-valuemin', '0');
    hueHandle.setAttribute('aria-valuemax', '359');
    hueHandle.setAttribute('tabindex', '0');

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

    // ─── State sync (rAF throttled) ───────────────────────────────────
    let rafPending = false;
    const scheduleSync = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; syncFromState(); });
    };

    const renderInputForFormat = (hex) => {
      if (formatSelect.value === 'rgb') return formatRgbDisplay(hex);
      if (formatSelect.value === 'hsl') return formatHslDisplay(h, s, l);
      return formatHexDisplay(hex);
    };

    const syncFromState = () => {
      const hex = BC.hslToHex(h, s, l);
      hueHandleOrbit.style.transform = `rotate(${h}deg)`;
      hueHandle.setAttribute('aria-valuenow', String(Math.round(h)));
      slHandle.style.left = `${s}%`;
      slHandle.style.top = `${100 - l}%`;
      slHandle.style.transform = 'translate(-50%, -50%)';
      slHandle.setAttribute('aria-valuenow', `${Math.round(s)},${Math.round(l)}`);
      slHandle.setAttribute('aria-valuetext', `Saturación ${Math.round(s)}%, luminosidad ${Math.round(l)}%`);
      slArea.style.background = `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
      previewEl.style.background = hex;
      if (document.activeElement !== hexInput) {
        hexInput.value = renderInputForFormat(hex);
      }
    };

    // ─── Pointer drag helper ──────────────────────────────────────────
    const attachPointerDrag = (el, onMove) => {
      let active = false;
      el.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        active = true;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        onMove(e);
      });
      el.addEventListener('pointermove', (e) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        onMove(e);
      });
      const end = (e) => {
        if (!active) return;
        active = false;
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', () => { active = false; });
    };

    // Hue ring: el SL hace stopPropagation, así que los pointerdown
    // dentro del SL no llegan aquí. Una vez iniciado el drag, el ángulo
    // sigue actualizándose aunque el cursor cruce al centro.
    attachPointerDrag(hueRing, (e) => {
      const rect = hueRing.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      h = ((angle % 360) + 360) % 360;
      scheduleSync();
    });

    attachPointerDrag(slArea, (e) => {
      const rect = slArea.getBoundingClientRect();
      s = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      l = clamp(100 - ((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      scheduleSync();
    });

    // ─── Keyboard nav ─────────────────────────────────────────────────
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

    // ─── Input multi-formato tolerante ────────────────────────────────
    const tryConsumeInput = (raw) => {
      const trimmed = String(raw || '').trim();
      const hex = parseHex(trimmed);
      if (hex) { const hsl = BC.hexToHSL(hex); h = hsl.h; s = hsl.s; l = hsl.l; return true; }
      const rgb = parseRgb(trimmed);
      if (rgb) {
        const hexFromRgb = rgbToHex(rgb.r, rgb.g, rgb.b);
        const hsl = BC.hexToHSL(hexFromRgb);
        h = hsl.h; s = hsl.s; l = hsl.l;
        return true;
      }
      const hsl = parseHsl(trimmed);
      if (hsl) { h = hsl.h; s = hsl.s; l = hsl.l; return true; }
      return false;
    };

    hexInput.addEventListener('input', () => {
      if (tryConsumeInput(hexInput.value)) scheduleSync();
    });
    hexInput.addEventListener('blur', () => {
      hexInput.value = renderInputForFormat(BC.hslToHex(h, s, l));
    });
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
    });
    formatSelect.addEventListener('change', () => {
      hexInput.value = renderInputForFormat(BC.hslToHex(h, s, l));
    });

    // ─── Apply / Cancel / Esc / backdrop ──────────────────────────────
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);

    applyBtn.addEventListener('click', () => {
      const hex = BC.hslToHex(h, s, l);
      if (typeof onApply === 'function') {
        try { onApply(hex); } catch (err) { console.error('[ColorPickerModal] onApply error:', err); }
      }
      close();
    });
    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

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
    root.appendChild(modal);

    syncFromState();
    hexInput.value = renderInputForFormat(BC.hslToHex(h, s, l));
    hexInput.focus();
    hexInput.select();

    return { close };
  }

  window.ColorPickerModal = { open };
})();
