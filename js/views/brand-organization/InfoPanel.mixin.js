/**
 * BrandOrganizationView — InfoPanel mixin.
 *
 * Panel INFO derecho de la vista de organización: incluye apertura/cierre,
 * render del schema (aside), assets section, setups de edición inline
 * (save-on-blur) y mapeo a columnas de `brands` (array/json/text/textarea
 * normalization + binding del dropdown de `nicho_core`).
 *
 * Aplica sobre BrandOrganizationView.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof BrandOrganizationView === 'undefined') {
    console.warn('[InfoPanel.mixin] BrandOrganizationView no disponible; se aborta el mixin.');
    return;
  }

  const InfoPanelMixin = {
  openInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoCard = container.querySelector('.card-info');
    if (!infoCard) return;
    
    const cardsZone = container.querySelector('.brand-cards-zone');
    const otherCards = cardsZone ? Array.from(cardsZone.querySelectorAll('.brand-card:not(.card-info)')) : [];
    const cornerInfo = container.querySelector('.brand-corner-bottom-left');
    
    // Crear contenido expandido dentro de la card
    const existingContent = infoCard.querySelector('.card-content-expanded');
    if (existingContent) {
      // Ya está expandido
      return;
    }
    
    const content = document.createElement('div');
    content.className = 'card-content-expanded';
    content.id = 'infoPanelContent';
    
    // Renderizar contenido
    this.renderInfoPanelContent(content);
    
    // Agregar botón cerrar al header
    const header = infoCard.querySelector('.card-header');
    if (header) {
      const existingClose = header.querySelector('.info-close-btn');
      if (!existingClose) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'info-close-btn';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeInfoPanel();
        });
        header.appendChild(closeBtn);
      }
    }
    
    // Agregar contenido a la card
    infoCard.appendChild(content);
    
    // Obtener contenedor principal
    const dashboardContainer = container.querySelector('.brand-dashboard-container') || container;
    
    // Guardar estado ANTES de hacer cambios
    this.infoPanelState = {
      otherCards,
      cornerInfo,
      infoCard,
      dashboardContainer,
      cardsZone
    };
    
    // Preparar infoCard para animación (antes de moverla)
    infoCard.style.willChange = 'opacity, transform, width, height';
    
    // Ocultar otras cards y nombre de marca con fade out suave
    otherCards.forEach((card, index) => {
      card.style.willChange = 'opacity, transform';
      card.style.transition = `opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.03}s, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.03}s`;
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px) scale(0.98)';
    });
    
    if (cornerInfo) {
      cornerInfo.style.willChange = 'opacity, transform';
      cornerInfo.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s';
      cornerInfo.style.opacity = '0';
      cornerInfo.style.transform = 'translateY(12px) scale(0.98)';
    }
    
    // Cambiar a modo secundario después de que las otras cards empiecen a desaparecer
    setTimeout(() => {
      dashboardContainer.classList.add('info-mode-secondary');
      dashboardContainer.classList.remove('info-expanded'); // Limpiar clase antigua si existe
      
      // Mover la card fuera del contenedor de cards al contenedor principal
      infoCard.classList.add('expanded');
      dashboardContainer.appendChild(infoCard);
      
      // Preparar estado inicial para animación suave
      requestAnimationFrame(() => {
        infoCard.style.opacity = '0';
        infoCard.style.transform = 'scale(0.96) translateY(15px)';
        infoCard.style.transition = 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s';
        
        // Animar entrada con doble requestAnimationFrame para suavidad
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            infoCard.style.opacity = '1';
            infoCard.style.transform = 'scale(1) translateY(0)';
          });
        });
      });
    }, 150); // Timing optimizado para mejor sincronización
  },

  closeInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    
    const infoCard = container.querySelector('.card-info.expanded');
    if (!infoCard) return;
    
    if (!this.infoPanelState) return;
    
    const { dashboardContainer, cardsZone, otherCards, cornerInfo } = this.infoPanelState;
    
    // Animar contenido primero (fade out rápido)
    const content = infoCard.querySelector('.card-content-expanded');
    if (content) {
      content.style.transition = 'opacity 0.2s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
      content.style.opacity = '0';
    }
    
    // Preparar animación de salida suave de la card
    infoCard.style.willChange = 'opacity, transform';
    infoCard.style.transition = 'opacity 0.5s cubic-bezier(0.55, 0.055, 0.675, 0.19), transform 0.5s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
    
    // Animar salida con pequeño delay para que el contenido desaparezca primero
    setTimeout(() => {
      requestAnimationFrame(() => {
        infoCard.style.opacity = '0';
        infoCard.style.transform = 'scale(0.96) translateY(-15px)';
      });
    }, 100);
    
    // Esperar a que termine la animación de salida (incluyendo el delay del contenido)
    setTimeout(() => {
      // Remover clase expandida de la card
      infoCard.classList.remove('expanded');
      
      // Limpiar estilos de la card
      infoCard.style.position = '';
      infoCard.style.top = '';
      infoCard.style.right = '';
      infoCard.style.width = '';
      infoCard.style.height = '';
      infoCard.style.transition = '';
      infoCard.style.margin = '';
      infoCard.style.maxWidth = '';
      infoCard.style.opacity = '';
      infoCard.style.transform = '';
      infoCard.style.willChange = '';
      
      // Remover contenido expandido
      const content = infoCard.querySelector('.card-content-expanded');
      if (content) {
        content.remove();
      }
      
      // Remover botón cerrar
      const closeBtn = infoCard.querySelector('.info-close-btn');
      if (closeBtn) {
        closeBtn.remove();
      }
      
      // Devolver la card al contenedor de cards (al inicio) ANTES de cambiar modo
      if (cardsZone) {
        cardsZone.insertBefore(infoCard, cardsZone.firstChild);
      }
      
      // Volver a modo principal: remover modo secundario
      if (dashboardContainer) {
        dashboardContainer.classList.remove('info-mode-secondary');
      }
      
      // Pequeño delay para que el cambio de modo se aplique antes de mostrar otras cards
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Mostrar otras cards y nombre de marca con fade in escalonado
          if (otherCards && otherCards.length > 0) {
            otherCards.forEach((card, index) => {
              if (card.parentElement) {
                card.style.willChange = 'opacity, transform';
                card.style.transition = `opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${0.3 + index * 0.04}s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${0.3 + index * 0.04}s`;
                card.style.opacity = '1';
                card.style.transform = 'translateY(0) scale(1)';
              }
            });
          }
          
          if (cornerInfo && cornerInfo.parentElement) {
            cornerInfo.style.willChange = 'opacity, transform';
            cornerInfo.style.transition = 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.35s, transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.35s';
            cornerInfo.style.opacity = '1';
            cornerInfo.style.transform = 'translateY(0) scale(1)';
          }
          
          // Limpiar estilos después de la animación
          setTimeout(() => {
            if (otherCards) {
              otherCards.forEach(card => {
                card.style.transition = '';
                card.style.opacity = '';
                card.style.transform = '';
                card.style.willChange = '';
              });
            }
            
            if (cornerInfo) {
              cornerInfo.style.transition = '';
              cornerInfo.style.opacity = '';
              cornerInfo.style.transform = '';
              cornerInfo.style.willChange = '';
            }
            
            this.infoPanelState = null;
          }, 800); // Tiempo suficiente para todas las animaciones
        });
      });
    }, 500); // Tiempo de animación de salida (sincronizado con CSS)
  },

  _refreshInfoPanelIfOpen() {
    const root = this.container || document.getElementById('app-container');
    const infoCard = root?.querySelector('.card-info.expanded');
    if (!infoCard) return;
    const content = infoCard.querySelector('#infoPanelContent');
    if (content) {
      this.renderInfoPanelContent(content);
    }
  },

  /**
   * Lista de `brand_assets` del workspace en el panel INFO (sustituye integraciones sociales).
   */
  renderInfoAssetsSectionHtml() {
    const assets = this.brandAssets || [];
    if (!assets.length) {
      return `
      <section class="info-section info-section-assets" aria-labelledby="infoAssetsHeading">
        <h3 class="info-section-title" id="infoAssetsHeading">Assets</h3>
        <p class="info-assets-empty">Aún no hay archivos. Súbelos desde la card «Archivos de identidad».</p>
      </section>`;
    }
    const items = assets.slice(0, 16).map((a) => {
      const name = this.escapeHtml(a.file_name || 'Archivo');
      const url = this.escapeHtml(String(a.file_url || '').trim() || '#');
      const type = String(a.file_type || '').toLowerCase();
      const fname = String(a.file_name || '');
      const isImg =
        type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fname);
      const thumb = isImg
        ? `<img src="${url}" alt="" class="info-asset-thumb" loading="lazy" width="40" height="40">`
        : `<span class="info-asset-icon" aria-hidden="true"><i class="fas fa-file"></i></span>`;
      const sizeKb =
        a.file_size != null && Number.isFinite(Number(a.file_size))
          ? `<span class="info-asset-meta">${Math.max(1, Math.round(Number(a.file_size) / 1024))} KB</span>`
          : '';
      return `
        <li class="info-asset-row">
          <div class="info-asset-preview">${thumb}</div>
          <div class="info-asset-main">
            <span class="info-asset-name">${name}</span>
            ${sizeKb}
          </div>
          <a class="info-connect-external" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Abrir archivo"><i class="fas fa-external-link-alt" aria-hidden="true"></i></a>
        </li>`;
    }).join('');
    return `
      <section class="info-section info-section-assets" aria-labelledby="infoAssetsHeading">
        <h3 class="info-section-title" id="infoAssetsHeading">Assets</h3>
        <ul class="info-asset-list" role="list">${items}</ul>
      </section>`;
  },

  renderBrandSchemaAsideHtml() {
    const blocks = [
      { field: 'brand_name_oficial', label: 'Nombre de marca', type: 'text' },
      { field: 'name', label: 'Nombre del workspace', type: 'text' },
      { field: 'brand_slogan', label: 'Tagline / eslogan', type: 'textarea' },
      { field: 'level_of_autonomy', label: 'Nivel de autonomía', type: 'text' }
    ]
      .map(({ field, label, type }) => {
        const f = this.escapeHtml(field);
        const lab = this.escapeHtml(label);
        let control = '';
        if (type === 'text') {
          control = `<div class="info-brand-text-editor info-brand-field-value" data-field="${f}" data-editor-type="text"></div>`;
        } else if (type === 'textarea') {
          control = `<textarea class="info-brand-field-value info-brand-textarea" data-field="${f}" data-editor-type="textarea" rows="3" spellcheck="true"></textarea>`;
        }
        return `
      <div class="info-brand-field" data-brand-field="${f}">
        <div class="info-brand-field-label">${lab}</div>
        ${control}
      </div>`;
      })
      .join('');

    return `
      <div class="info-brand-aside-inner">
        <h3 class="info-section-title" id="infoBrandSchemaHeading">Organización</h3>
        <p class="info-brand-aside-lead">Campos persistidos en la fila del workspace.</p>
        <div class="info-brand-fields">
          ${blocks}
        </div>
      </div>
    `;
  },

  renderInfoPanelContent(container) {
    if (!container) return;

    const singleSubBrand = Array.isArray(this.brandContainers) && this.brandContainers.length === 1
      ? this.brandContainers[0] : null;
    const storageHref = this.escapeHtml(this.getBrandStoragePageHref());
    const subBrandBridge = singleSubBrand
      ? `<div class="info-single-subbrand-bridge">
          <div class="info-single-subbrand-bridge__title">${this.escapeHtml(singleSubBrand.nombre_marca || 'Sub-marca')}</div>
          <p class="info-single-subbrand-bridge__lead">Ficha completa, integraciones y campañas viven en <strong>Brand Storage</strong>.</p>
          <a href="${storageHref}" class="btn btn-primary btn-sm" data-route="${storageHref}">Abrir Brand Storage</a>
        </div>`
      : '';

    const brandContainer = this.brandContainerData;
    container.innerHTML = `
      ${subBrandBridge}
      <div class="info-panel-grid">
        <div class="info-panel-grid__primary">
          <section class="info-section info-section-identity">
            <div class="info-section-content">
              ${this.renderIdentitySection(brandContainer)}
              </div>
          </section>
          ${this.renderInfoAssetsSectionHtml()}
        </div>
        <aside class="info-panel-grid__secondary" aria-labelledby="infoBrandSchemaHeading">
          ${this.renderBrandSchemaAsideHtml()}
        </aside>
      </div>
    `;
    this.setupInfoPanelEditables(container);
    if (typeof this.updateLinksForRouter === 'function') {
      this.updateLinksForRouter();
    }
  },

  setupInfoPanelEditables(container) {
    if (!container) return;
    const logoInput = container.querySelector('.info-logo-container input[type="file"]');
    if (logoInput && logoInput.dataset.infoLogoBound !== '1') {
      logoInput.dataset.infoLogoBound = '1';
      logoInput.addEventListener('change', (e) => {
        if (e.target.files[0]) this.uploadLogo(e.target.files[0]);
      });
    }
    this.setupInfoBrandFieldEditors(container);
  },

  /**
   * Normaliza valores para insert/update en `brands` según tipo de columna.
   * @param {string} fieldName
   * @param {*} value
   * @returns {string|string[]|object}
   */
  _normalizeBrandFieldForDb(fieldName, value) {
    const jsonFields = BrandOrganizationView.BRAND_JSON_FIELDS;
    const arrFields = BrandOrganizationView.BRAND_ARRAY_FIELDS;

    if (jsonFields.includes(fieldName)) {
      if (value == null || value === '') return {};
      if (typeof value === 'string') {
        try {
          const o = JSON.parse(value);
          return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
        } catch (_) {
          return {};
        }
      }
      if (typeof value === 'object' && !Array.isArray(value)) return value;
      return {};
    }

    if (arrFields.includes(fieldName)) {
      return Array.isArray(value) ? value : [];
    }

    if (fieldName === 'nicho_core') {
      return String(value ?? '').trim();
    }

    if (BrandOrganizationView.BRAND_TEXTAREA_FIELDS.includes(fieldName) || BrandOrganizationView.BRAND_TEXT_FIELDS.includes(fieldName)) {
      const s = value == null ? '' : String(value).trim();
      return s === '' ? null : s;
    }

    return value;
  },

  setupInfoBrandFieldEditors(container) {
    const brand = this.brandData;

    container.querySelectorAll('[data-editor-type="text"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      el.textContent = raw != null ? String(raw) : '';
      this.makeEditableText(el, field, 'brand', null);
    });

    container.querySelectorAll('[data-editor-type="textarea"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      el.value = raw != null ? String(raw) : '';
      if (el.dataset.brandTextareaBound === '1') return;
      el.dataset.brandTextareaBound = '1';
      el.addEventListener('blur', async () => {
        const v = el.value.trim();
        const cur = this.brandData?.[field] != null ? String(this.brandData[field]).trim() : '';
        if (v !== cur) await this.saveBrandField(field, v === '' ? null : v);
      });
    });

    container.querySelectorAll('[data-editor-type="json"]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      const raw = brand?.[field];
      if (raw && typeof raw === 'object') {
        el.value = JSON.stringify(raw, null, 2);
      } else if (typeof raw === 'string') {
        el.value = raw;
      } else {
        el.value = '{}';
      }
      if (el.dataset.brandJsonBound === '1') return;
      el.dataset.brandJsonBound = '1';
      el.addEventListener('blur', async () => {
        let parsed = {};
        const t = el.value.trim();
        if (t) {
          try {
            parsed = JSON.parse(t);
          } catch (_) {
            alert(`JSON no válido en ${field}. Revisá la sintaxis.`);
            el.focus();
            return;
          }
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          alert('Este campo debe ser un objeto JSON (por ejemplo { "clave": "valor" }).');
          return;
        }
        const prev = JSON.stringify(this.brandData?.[field] || {});
        const next = JSON.stringify(parsed);
        if (prev !== next) await this.saveBrandField(field, parsed);
        el.value = JSON.stringify(this.brandData?.[field] || {}, null, 2);
      });
    });

    container.querySelectorAll('.info-brand-array-editor[data-field]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (!field) return;
      this.makeEditableMultiSelect(el, field, [], 'brand', null);
    });

    container.querySelectorAll('.info-brand-select[data-editor-type="select"]').forEach((wrap) => {
      this._bindInfoBrandNichoSelect(wrap);
    });
  },

  /**
   * Desplegable custom para nicho_core (estilo pill + lista, sin depender de &lt;select&gt; nativo).
   */
  _bindInfoBrandNichoSelect(wrap) {
    const field = wrap.getAttribute('data-field');
    if (field !== 'nicho_core' || wrap.dataset.nichoSelectBound === '1') return;
    wrap.dataset.nichoSelectBound = '1';

    const trigger = wrap.querySelector('.info-brand-select__trigger');
    const panel = wrap.querySelector('.info-brand-select__panel');
    const valueEl = wrap.querySelector('.info-brand-select__value');
    if (!trigger || !panel || !valueEl) return;

    const getOptions = () => panel.querySelectorAll('.info-brand-select__option');

    const setOpen = (open) => {
      if (wrap._nichoDocCloser) {
        document.removeEventListener('click', wrap._nichoDocCloser, true);
        wrap._nichoDocCloser = null;
      }
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      wrap.classList.toggle('is-open', open);
      if (open) {
        wrap._nichoDocCloser = (ev) => {
          if (!wrap.contains(ev.target)) setOpen(false);
        };
        setTimeout(() => document.addEventListener('click', wrap._nichoDocCloser, true), 0);
      }
    };

    const syncSelectionClasses = () => {
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      getOptions().forEach((li) => {
        const v = li.getAttribute('data-value') != null ? li.getAttribute('data-value') : '';
        li.classList.toggle('is-selected', v === cur);
      });
    };

    const refreshLabel = () => {
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      valueEl.textContent = BrandOrganizationView.getNichoCoreLabel(cur);
    };

    refreshLabel();
    syncSelectionClasses();

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(panel.hidden);
    });

    panel.addEventListener('click', async (e) => {
      const li = e.target.closest('.info-brand-select__option');
      if (!li || !panel.contains(li)) return;
      e.stopPropagation();
      const v = li.getAttribute('data-value') != null ? li.getAttribute('data-value') : '';
      const cur = this.brandData?.[field] != null ? String(this.brandData[field]) : '';
      if (v !== cur) await this.saveBrandField(field, v);
      refreshLabel();
      syncSelectionClasses();
      setOpen(false);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
        e.preventDefault();
        setOpen(false);
      }
    });
  },

  };

  Object.assign(BrandOrganizationView.prototype, InfoPanelMixin);
})();
