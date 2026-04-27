/**
 * Shared Typography mixin — consumido por BrandstorageView y BrandOrganizationView.
 *
 * Dropdown de tipografía para imágenes: preview con Google Fonts lazy-loaded,
 * persistencia en `brand_fonts` (font_usage = 'images'). Aplica Object.assign
 * sobre el prototype de cada clase definida al cargarse.
 */
(function () {
  'use strict';

  const TypographyMixin = {
    getTypographyFontFamily() {
      const fontRow = (this.brandFonts || []).find(f => (f.font_usage || '').toLowerCase() === 'images');
      if (fontRow && fontRow.font_family) return fontRow.font_family;
      return 'Inter';
    },

    loadFontForPreview(fontFamily) {
      if (!fontFamily || fontFamily === 'Inter') return;
      const id = `font-preview-${fontFamily.replace(/\s+/g, '-')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, '+')}:wght@400;600&display=swap`;
      document.head.appendChild(link);
    },

    loadAllTypographyFonts() {
      const fonts = window.BrandSchema ? window.BrandSchema.TYPOGRAPHY_FONTS : [];
      fonts.forEach(f => this.loadFontForPreview(f.value));
    },

    renderTypography() {
      const container = (this.container && this.container.querySelector('#typographyPreview')) ||
                        document.getElementById('typographyPreview');
      if (!container) {
        if (!this._containerWarned.typographyPreview) {
          this._containerWarned.typographyPreview = true;
          console.warn('⚠️ typographyPreview no encontrado');
        }
        return;
      }
      const currentFont = this.getTypographyFontFamily();
      this.loadFontForPreview(currentFont);
      const fonts = window.BrandSchema ? window.BrandSchema.TYPOGRAPHY_FONTS : [];
      const dropdownId = 'typographyFontDropdown';
      const panelId = 'typographyFontPanel';
      container.innerHTML = `
        <label class="typography-label">Tipografía para imágenes</label>
        <div class="typography-dropdown" id="${dropdownId}" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-label="Seleccionar tipografía para imágenes">
          <button type="button" class="typography-dropdown-trigger" aria-controls="${panelId}">
            <span class="typography-trigger-name">${this.escapeHtml(currentFont)}</span>
            <span class="typography-trigger-preview" style="font-family: '${this.escapeHtml(currentFont)}', sans-serif;">AaBbCc</span>
            <span class="typography-trigger-chevron" aria-hidden="true"></span>
          </button>
          <div class="typography-dropdown-panel" id="${panelId}" role="listbox" hidden>
            ${fonts.map(f => `
              <div class="typography-dropdown-option" role="option" data-value="${this.escapeHtml(f.value)}" ${f.value === currentFont ? 'aria-selected="true"' : ''}>
                <span class="typography-option-name">${this.escapeHtml(f.label)}</span>
                <span class="typography-option-preview" style="font-family: '${this.escapeHtml(f.value)}', sans-serif;">AaBbCc</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      const dropdown = container.querySelector(`#${dropdownId}`);
      const trigger = container.querySelector('.typography-dropdown-trigger');
      const panel = container.querySelector(`#${panelId}`);
      const options = container.querySelectorAll('.typography-dropdown-option');

      const closePanel = () => {
        if (panel) panel.setAttribute('hidden', '');
        if (dropdown) dropdown.setAttribute('aria-expanded', 'false');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (this._typographyOutsideClose) {
          document.removeEventListener('click', this._typographyOutsideClose);
          this._typographyOutsideClose = null;
        }
      };

      const selectFont = async (fontValue) => {
        closePanel();
        this.loadFontForPreview(fontValue);
        const previousFonts = [...(this.brandFonts || [])];
        const others = (this.brandFonts || []).filter(f => (f.font_usage || '').toLowerCase() !== 'images');
        this.brandFonts = [...others, { organization_id: this.brandContainerData?.organization_id, font_usage: 'images', font_family: fontValue, font_weight: '400', fallback_font: 'sans-serif' }];
        this.renderTypography();
        try {
          if (this._typographySavePromise) await this._typographySavePromise;
          this._typographySavePromise = this.saveTypographyForImages(fontValue);
          await this._typographySavePromise;
        } catch (e) {
          this.brandFonts = previousFonts;
          this.renderTypography();
        } finally {
          this._typographySavePromise = null;
        }
      };

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = panel && !panel.hasAttribute('hidden');
          if (isOpen) {
            closePanel();
          } else {
            this.loadAllTypographyFonts();
            if (panel) panel.removeAttribute('hidden');
            if (dropdown) dropdown.setAttribute('aria-expanded', 'true');
            if (trigger) trigger.setAttribute('aria-expanded', 'true');
            this._typographyOutsideClose = (ev) => {
              if (dropdown && !dropdown.contains(ev.target)) closePanel();
            };
            document.addEventListener('click', this._typographyOutsideClose);
          }
        });
      }

      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = opt.getAttribute('data-value');
          if (value) selectFont(value);
        });
      });
    },

    async saveTypographyForImages(fontFamily) {
      const orgId = this.brandContainerData?.organization_id;
      if (!this.supabase || !orgId) return;
      try {
        const { data: existing } = await this.supabase
          .from('brand_fonts')
          .select('id')
          .eq('organization_id', orgId)
          .eq('font_usage', 'images')
          .limit(1)
          .maybeSingle();
        if (existing) {
          await this.supabase
            .from('brand_fonts')
            .update({ font_family: fontFamily, font_weight: '400', fallback_font: 'sans-serif' })
            .eq('id', existing.id);
        } else {
          await this.supabase
            .from('brand_fonts')
            .insert({ organization_id: orgId, font_family: fontFamily, font_usage: 'images', font_weight: '400', fallback_font: 'sans-serif' });
        }
      } catch (e) {
        console.error('Error al guardar tipografía:', e);
        alert('No se pudo guardar la tipografía. Intenta de nuevo.');
      }
    }
  };

  function applyTypographyToBrandViews() {
    if (typeof BrandstorageView !== 'undefined') Object.assign(BrandstorageView.prototype, TypographyMixin);
    if (typeof BrandOrganizationView !== 'undefined') Object.assign(BrandOrganizationView.prototype, TypographyMixin);
  }
  applyTypographyToBrandViews();
  /** Tras visitar otra vista de marca, el script del mixin puede estar en caché y no re-ejecutarse; las vistas llaman esto al definirse. */
  window.__applyTypographyMixinToBrandViews = applyTypographyToBrandViews;
})();
