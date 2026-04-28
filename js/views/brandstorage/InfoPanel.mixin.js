/**
 * BrandstorageView — InfoPanel mixin.
 *
 * Panel INFO del Brand Storage: contiene el render + wiring + persistencia de
 * dos paneles distintos, ambos escondidos tras un drawer lateral:
 *
 *   1. Panel de SUB-MARCA (`openBrandContainerInfoPanel`): para cada brand_container
 *      renderiza su schema (idiomas, mercado, nicho, sub-nichos, arquetipo, propuesta,
 *      misión, ADN verbal/visual, palabras clave/prohibidas, objetivos), sus
 *      integraciones (Google/Facebook OAuth), sus campañas, audiencias y entidades.
 *   2. Panel de ORGANIZACIÓN (`openInfoPanel` / `closeInfoPanel`): vista readonly
 *      del schema de organización + assets + bloque Identidad.
 *
 * También incluye los helpers de accesores por container y de persistencia
 * inline (save on blur) para sub-marca, integraciones y entidades.
 *
 * Mixin vanilla: aplica sobre BrandstorageView.prototype. Cargar DESPUÉS de
 * BrandstorageView.js (ver app.js brandStorageViewLoader).
 */
(function () {
  'use strict';
  if (typeof BrandstorageView === 'undefined') {
    console.warn('[InfoPanel.mixin] BrandstorageView no disponible; se aborta el mixin.');
    return;
  }

  const InfoPanelMixin = {
  getIntegrationsForContainer(brandContainerId) {
    const id = String(brandContainerId || '');
    return (this.brandIntegrations || []).filter((row) => String(row.brand_container_id || '') === id);
    },

  getCampaignsForContainer(brandContainerId) {
    const id = String(brandContainerId || '');
    return (this.brandCampaigns || []).filter((row) => String(row.brand_container_id || '') === id);
    },

  getAudiencesForContainer(brandContainerId) {
    const id = String(brandContainerId || '');
    return (this.brandAudiences || []).filter((row) => String(row.brand_container_id || '') === id);
    },

  getEntitiesForContainer(brandContainerId) {
    const id = String(brandContainerId || '');
    return (this.brandEntities || []).filter((row) => String(row.brand_container_id || '') === id);
    },

  getOrgDashboardHref() {
    const orgId = window.currentOrgId || this.organizationRow?.id || this.brandContainerData?.organization_id;
    const name = (window.currentOrgName || this.organizationRow?.name || '').trim();
    if (orgId && typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(orgId, name);
      if (prefix) return `${prefix}/dashboard`;
    }
    return '/dashboard';
    },

  _pickBrandIntegrationForContainer(brandContainerId, platform) {
    const rows = this.getIntegrationsForContainer(brandContainerId);
    const normPlatform = String(platform || '').toLowerCase();
    const active = rows.filter((r) => r && String(r.platform || '').toLowerCase() === normPlatform && r.is_active);
    if (active.length) return active[0];
    const any = rows.find((r) => r && String(r.platform || '').toLowerCase() === normPlatform);
    return any || null;
    },

  _integrationTokenExpired(row) {
    if (!row?.token_expires_at) return false;
    return new Date(row.token_expires_at) < new Date();
    },

  _integrationUsable(row) {
    return !!(row && row.is_active && !this._integrationTokenExpired(row));
    },

  buildInfoIntegrationRows(brandContainerId) {
    const dashboardHref = this.getOrgDashboardHref();
    const google = this._pickBrandIntegrationForContainer(brandContainerId, 'google');
    const facebook = this._pickBrandIntegrationForContainer(brandContainerId, 'facebook');
    const gOk = this._integrationUsable(google);
    const fOk = this._integrationUsable(facebook);

    return [
      {
        key: 'youtube',
        label: 'YouTube',
        iconClass: 'fab fa-youtube',
        connected: gOk,
        oauthProvider: 'google',
        actionHref: gOk ? 'https://www.youtube.com/' : dashboardHref,
        actionExternal: gOk,
        hint: ''
      },
      {
        key: 'facebook',
        label: 'Facebook',
        iconClass: 'fab fa-facebook-f',
        connected: fOk,
        oauthProvider: 'facebook',
        actionHref: fOk ? 'https://www.facebook.com/' : dashboardHref,
        actionExternal: fOk,
        hint: ''
      },
      {
        key: 'instagram',
        label: 'Instagram',
        iconClass: 'fab fa-instagram',
        connected: fOk,
        oauthProvider: 'facebook',
        actionHref: fOk ? 'https://www.instagram.com/' : dashboardHref,
        actionExternal: fOk,
        hint: ''
      }
    ];
    },

  renderIntegrationsSection(brandContainerId) {
    const rows = this.buildInfoIntegrationRows(brandContainerId);
    const items = rows
      .map((row) => {
        const linkAttrs = row.actionExternal
          ? `href="${row.actionHref}" target="_blank" rel="noopener noreferrer"`
          : `href="${row.actionHref}" data-route="${row.actionHref}"`;
        const linkedIcon = row.connected
          ? '<span class="info-connect-linked" title="Conectado" aria-hidden="true"><i class="fas fa-link"></i></span>'
          : '';
        const hint = row.hint
          ? `<span class="info-connect-hint">${this.escapeHtml(row.hint)}</span>`
          : '';
        const actionHtml = row.connected
          ? `
            <div class="info-connect-actions">
              <a class="info-connect-action is-open" ${linkAttrs} aria-label="Abrir ${this.escapeHtml(row.label)}">Abrir</a>
              <button type="button" class="info-connect-action is-disconnect" data-disconnect-provider="${this.escapeHtml(row.oauthProvider || '')}" data-brand-container-id="${this.escapeHtml(String(brandContainerId || ''))}" aria-label="Desconectar ${this.escapeHtml(row.label)}">Desconectar</button>
            </div>
          `
          : `<button type="button" class="info-connect-action is-connect" data-connect-provider="${this.escapeHtml(row.oauthProvider || '')}" data-connect-label="${this.escapeHtml(row.label)}" data-brand-container-id="${this.escapeHtml(String(brandContainerId || ''))}" aria-label="Conectar ${this.escapeHtml(row.label)}">Conectar</button>`;
        return `
          <li class="info-connect-row" data-connect-key="${this.escapeHtml(row.key)}">
            <span class="info-connect-icon" aria-hidden="true"><i class="${this.escapeHtml(row.iconClass)}"></i></span>
            <div class="info-connect-main">
              <span class="info-connect-label">${this.escapeHtml(row.label)}</span>
              ${hint}
            </div>
            ${linkedIcon}
            ${actionHtml}
          </li>`;
      })
      .join('');

    return `
      <section class="info-section info-section-connect" aria-labelledby="infoConnectHeading">
        <h3 class="info-section-title" id="infoConnectHeading">En la web</h3>
        <ul class="info-connect-list" role="list">${items}</ul>
      </section>`;
    },

  renderBrandReadonlySchema(item) {
    const fieldHtml = [{ field: 'nombre_marca', label: 'Nombre de sub-marca', type: 'text' }, ...BrandstorageView.BRAND_SCHEMA_BLOCKS].map((block) => {
      const raw = item?.[block.field];
      let valueHtml = '';
      if (block.type === 'select') {
        valueHtml = this.renderBrandSingleSelect(block.field, raw, BrandstorageView.NICHO_CORE_OPTIONS);
      } else if (block.type === 'array') {
        if (block.field === 'idiomas_contenido' || block.field === 'mercado_objetivo' || block.field === 'sub_nichos') {
          valueHtml = this.renderBrandArrayMultiSelect(block.field, raw);
        } else {
          const textValue = Array.isArray(raw) ? raw.join(', ') : '';
          valueHtml = `<textarea class="info-brand-textarea" data-brand-field="${this.escapeHtml(block.field)}" data-brand-input-type="array" rows="2" spellcheck="true">${this.escapeHtml(textValue)}</textarea>`;
        }
      } else if (block.type === 'json') {
        const jsonValue = raw && typeof raw === 'object' ? JSON.stringify(raw, null, 2) : '{}';
        valueHtml = `<textarea class="info-brand-json-textarea" data-brand-field="${this.escapeHtml(block.field)}" data-brand-input-type="json" rows="5" spellcheck="false">${this.escapeHtml(jsonValue)}</textarea>`;
      } else if (block.type === 'textarea') {
        const textValue = raw == null ? '' : String(raw);
        valueHtml = `<textarea class="info-brand-textarea" data-brand-field="${this.escapeHtml(block.field)}" data-brand-input-type="textarea" rows="3" spellcheck="true">${this.escapeHtml(textValue)}</textarea>`;
      } else {
        const textValue = raw == null ? '' : String(raw);
        valueHtml = `<div class="info-brand-text-editor editable-field" data-brand-field="${this.escapeHtml(block.field)}" data-brand-input-type="text" contenteditable="true">${this.escapeHtml(textValue)}</div>`;
      }
      return `
        <div class="info-brand-field">
          <div class="info-brand-field-label">${this.escapeHtml(block.label)}</div>
          ${valueHtml}
        </div>`;
    }).join('');
    return `<div class="info-brand-fields">${fieldHtml}</div>`;
    },

  renderCampaignsSection(brandContainerId) {
    const rows = this.getCampaignsForContainer(brandContainerId);
    if (!rows.length) {
      return `
      <section class="info-section" aria-labelledby="infoBrandCampaignsHeading">
        <h3 class="info-section-title" id="infoBrandCampaignsHeading">Campañas</h3>
        <p class="info-assets-empty">No hay campañas vinculadas a esta sub-marca.</p>
      </section>`;
    }

    const items = rows.slice(0, 8).map((row) => {
      const objetivo = Array.isArray(row.objetivos_estrategicos) ? row.objetivos_estrategicos[0] : '';
      const tono = Array.isArray(row.tono_modificador) ? row.tono_modificador.join(', ') : String(row.tono_modificador || '');
      return `
        <li class="info-asset-row">
          <div class="info-asset-preview"><span class="info-asset-icon" aria-hidden="true"><i class="fas fa-bullhorn"></i></span></div>
          <div class="info-asset-main">
            <span class="info-asset-name">${this.escapeHtml(row.nombre_campana || 'Campaña')}</span>
            <span class="info-asset-meta">${this.escapeHtml(row.descripcion_interna || row.contexto_temporal || objetivo || 'Sin descripción')}</span>
            ${tono ? `<span class="info-asset-meta">Tono: ${this.escapeHtml(tono)}</span>` : ''}
          </div>
          <span class="info-connect-external" aria-hidden="true"><i class="fas fa-calendar-alt"></i></span>
        </li>`;
    }).join('');

    return `
      <section class="info-section" aria-labelledby="infoBrandCampaignsHeading">
        <h3 class="info-section-title" id="infoBrandCampaignsHeading">Campañas</h3>
        <ul class="info-asset-list" role="list">${items}</ul>
      </section>`;
    },

  renderAudiencesSection(brandContainerId) {
    const rows = this.getAudiencesForContainer(brandContainerId);
    if (!rows.length) {
      return `
      <section class="info-section" aria-labelledby="infoBrandAudiencesHeading">
        <h3 class="info-section-title" id="infoBrandAudiencesHeading">Audiencias</h3>
        <p class="info-assets-empty">No hay audiencias registradas para esta sub-marca.</p>
      </section>`;
    }

    const items = rows.slice(0, 8).map((row) => {
      const dolor = Array.isArray(row.dolores) && row.dolores.length ? `Dolor: ${row.dolores[0]}` : '';
      const lenguaje = Array.isArray(row.estilo_lenguaje) && row.estilo_lenguaje.length ? `Lenguaje: ${row.estilo_lenguaje[0]}` : '';
      const resumen = [row.description, dolor, lenguaje].filter(Boolean).join(' · ');
      return `
        <li class="info-asset-row">
          <div class="info-asset-preview"><span class="info-asset-icon" aria-hidden="true"><i class="fas fa-users"></i></span></div>
          <div class="info-asset-main">
            <span class="info-asset-name">${this.escapeHtml(row.name || 'Audiencia')}</span>
            <span class="info-asset-meta">${this.escapeHtml(resumen || 'Sin descripción')}</span>
          </div>
          <span class="info-connect-external" aria-hidden="true"><i class="fas fa-user-check"></i></span>
        </li>`;
    }).join('');

    return `
      <section class="info-section" aria-labelledby="infoBrandAudiencesHeading">
        <h3 class="info-section-title" id="infoBrandAudiencesHeading">Audiencias</h3>
        <ul class="info-asset-list" role="list">${items}</ul>
      </section>`;
    },

  renderEntitiesSection(brandContainerId) {
    const rows = this.getEntitiesForContainer(brandContainerId);
    if (!rows.length) {
      return `
      <section class="info-section" aria-labelledby="infoBrandEntitiesHeading">
        <h3 class="info-section-title" id="infoBrandEntitiesHeading">Entidades y descripciones</h3>
        <p class="info-assets-empty">Sin entidades vinculadas.</p>
      </section>`;
    }

    const items = rows.slice(0, 8).map((row) => `
      <li class="info-asset-row">
        <div class="info-asset-preview"><span class="info-asset-icon" aria-hidden="true"><i class="fas fa-cube"></i></span></div>
        <div class="info-asset-main">
          <input type="text" class="info-brand-textarea" data-entity-id="${this.escapeHtml(String(row.id || ''))}" data-entity-field="name" value="${this.escapeHtml(String(row.name || ''))}" placeholder="Nombre entidad">
          <textarea class="info-brand-textarea" data-entity-id="${this.escapeHtml(String(row.id || ''))}" data-entity-field="description" rows="2" spellcheck="true" placeholder="Descripción de entidad">${this.escapeHtml(String(row.description || ''))}</textarea>
          <span class="info-asset-meta">${this.escapeHtml(row.entity_type || 'Sin tipo')}</span>
        </div>
        <span class="info-connect-external" aria-hidden="true"><i class="fas fa-file-alt"></i></span>
      </li>
    `).join('');

    return `
      <section class="info-section" aria-labelledby="infoBrandEntitiesHeading">
        <h3 class="info-section-title" id="infoBrandEntitiesHeading">Entidades y descripciones</h3>
        <ul class="info-asset-list" role="list">${items}</ul>
      </section>`;
    },

  renderBrandContainerInfoContent(item) {
    const name = this.escapeHtml(item?.nombre_marca || 'Sub-marca');
    const slogan = this.escapeHtml(String(item?.brand_slogan || item?.propuesta_valor || '').trim());
    const href = this.escapeHtml(this.getBrandContainerHref(item?.id));
    const updated = item?.updated_at ? this.formatInfoDate(item.updated_at) : '';
    const created = item?.created_at ? this.formatInfoDate(item.created_at) : '';

    const orgLogoUrl = String(this.organizationRow?.logo_url || '').trim();
    const logoUrl = orgLogoUrl;

    return `
      <div class="info-panel-grid">
        <div class="info-panel-grid__primary">
          <section class="info-section info-section-identity" aria-labelledby="infoBrandIdentityHeading">
            <h3 class="info-section-title" id="infoBrandIdentityHeading">Identidad</h3>
            <div class="info-identity-row info-identity-row--logo-only">
              <div class="info-logo-container">
                ${logoUrl
                  ? `<img src="${this.escapeHtml(logoUrl)}" alt="" class="info-logo-preview">`
                  : '<div class="info-logo-placeholder visible"><i class="fas fa-image"></i></div>'}
              </div>
            </div>
            <div class="brand-storage-info-summary">
              <div class="brand-storage-info-title">${name}</div>
              <div class="brand-storage-info-subtitle">${slogan || 'Sin propuesta de valor definida'}</div>
              <div class="brand-storage-info-dates">${updated ? `Última actualización ${this.escapeHtml(updated)}` : 'Sin actualizaciones'}</div>
            </div>
          </section>
          ${this.renderIntegrationsSection(item?.id)}
        </div>
        <aside class="info-panel-grid__secondary" aria-labelledby="infoBrandMetaHeading">
          <div class="info-brand-aside-inner">
            <h3 class="info-section-title" id="infoBrandMetaHeading">Ficha completa de la sub-marca</h3>
            ${this.renderBrandReadonlySchema(item)}
            ${this.renderCampaignsSection(item?.id)}
            ${this.renderAudiencesSection(item?.id)}
          </div>
        </aside>
      </div>
    `;
    },

  openBrandContainerInfoPanel(itemId) {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    const dashboardContainer = container.querySelector('.brand-dashboard-container') || container;
    const cardsZone = container.querySelector('.brand-cards-zone');
    if (!dashboardContainer || !cardsZone) return;

    const existing = dashboardContainer.querySelector('.brand-card.card-info.expanded.brand-storage-item-info-panel');
    if (existing) existing.remove();

    const item = (this.brandContainers || []).find((row) => String(row.id) === String(itemId));
    if (!item) return;

    const infoCard = document.createElement('div');
    infoCard.className = 'brand-card card-info expanded brand-storage-item-info-panel';
    infoCard.setAttribute('data-brand-container-id', String(item.id));
    infoCard.innerHTML = `
      <div class="card-header">
        <h2 class="card-title">INFO · ${this.escapeHtml(item.nombre_marca || 'Sub-marca')}</h2>
      </div>
      <div class="card-content-expanded" id="infoPanelContent">${this.renderBrandContainerInfoContent(item)}</div>
    `;

    const header = infoCard.querySelector('.card-header');
    if (header) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'info-close-btn';
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeBrandContainerInfoPanel();
      });
      header.appendChild(closeBtn);
    }

    this.brandContainerInfoState = { dashboardContainer };
    dashboardContainer.classList.add('info-mode-secondary');
    dashboardContainer.appendChild(infoCard);
    infoCard.style.opacity = '0';
    infoCard.style.transform = 'scale(0.97) translateY(10px)';
    requestAnimationFrame(() => {
      infoCard.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      infoCard.style.opacity = '1';
      infoCard.style.transform = 'scale(1) translateY(0)';
    });
    this.setupBrandContainerInfoPanelEditables(infoCard, item.id);

    if (typeof this.updateLinksForRouter === 'function') {
      this.updateLinksForRouter();
    }
    },

  async saveBrandContainerFieldById(brandContainerId, fieldName, value) {
    if (!this.supabase || !brandContainerId || !fieldName) return false;
    const normalizedValue = this._normalizeBrandFieldForDb(fieldName, value);
    const { error } = await this.supabase
      .from('brand_containers')
      .update({ [fieldName]: normalizedValue })
      .eq('id', brandContainerId);
    if (error) {
      console.error('BrandstorageView saveBrandContainerFieldById:', error);
      alert(`No se pudo guardar ${fieldName}.`);
      return false;
    }
    const row = (this.brandContainers || []).find((item) => String(item.id) === String(brandContainerId));
    if (row) row[fieldName] = normalizedValue;
    return true;
    },

  async saveBrandIntegrationField(integrationId, fieldName, value) {
    if (!this.supabase || !integrationId || !fieldName) return false;
    const normalized = fieldName === 'is_active' ? Boolean(Number(value)) : (String(value || '').trim() || null);
    const { error } = await this.supabase
      .from('brand_integrations')
      .update({ [fieldName]: normalized })
      .eq('id', integrationId);
    if (error) {
      console.error('BrandstorageView saveBrandIntegrationField:', error);
      alert(`No se pudo guardar integración (${fieldName}).`);
      return false;
    }
    const row = (this.brandIntegrations || []).find((item) => String(item.id) === String(integrationId));
    if (row) row[fieldName] = normalized;
    return true;
    },

  async saveBrandEntityField(entityId, fieldName, value) {
    if (!this.supabase || !entityId || !fieldName) return false;
    const normalized = String(value || '').trim() || null;
    const { error } = await this.supabase
      .from('brand_entities')
      .update({ [fieldName]: normalized })
      .eq('id', entityId);
    if (error) {
      console.error('BrandstorageView saveBrandEntityField:', error);
      alert(`No se pudo guardar entidad (${fieldName}).`);
      return false;
    }
    const row = (this.brandEntities || []).find((item) => String(item.id) === String(entityId));
    if (row) row[fieldName] = normalized;
    return true;
    },

  async startBrandIntegrationOAuth(provider, brandContainerId, actionButton = null) {
    const normalizedProvider = String(provider || '').toLowerCase();
    const brandId = String(brandContainerId || '').trim();
    if (!brandId || (normalizedProvider !== 'google' && normalizedProvider !== 'facebook')) return;
    if (!this.supabase) {
      alert('Supabase no disponible para conectar integración.');
      return;
    }

    const endpoint = normalizedProvider === 'facebook'
      ? '/api/integrations/facebook/start'
      : '/api/integrations/google/start';

    try {
      if (actionButton) {
        actionButton.disabled = true;
        actionButton.dataset.originalText = actionButton.textContent || 'Conectar';
        actionButton.textContent = 'Conectando...';
      }

      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert('Sesión no válida. Inicia sesión y vuelve a intentar.');
        return;
      }

      const returnTo = this.getBrandStorageReturnPath();
      const qs = new URLSearchParams({
        brand_container_id: brandId,
        return_to: returnTo
      });
      const res = await fetch(`${location.origin}${endpoint}?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.authorize_url) {
        throw new Error(json?.error || `No se pudo iniciar OAuth (${res.status})`);
      }
      window.location.href = json.authorize_url;
    } catch (error) {
      console.error('BrandstorageView startBrandIntegrationOAuth:', error);
      alert(error?.message || 'No se pudo conectar la integración.');
    } finally {
      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = actionButton.dataset.originalText || 'Conectar';
      }
    }
    },

  async disconnectBrandIntegration(provider, brandContainerId, actionButton = null) {
    const normalizedProvider = String(provider || '').toLowerCase();
    const brandId = String(brandContainerId || '').trim();
    if (!brandId || (normalizedProvider !== 'google' && normalizedProvider !== 'facebook')) return;
    if (!this.supabase) {
      alert('Supabase no disponible para desconectar integración.');
      return;
    }

    try {
      if (actionButton) {
        actionButton.disabled = true;
        actionButton.dataset.originalText = actionButton.textContent || 'Desconectar';
        actionButton.textContent = 'Desconectando...';
      }

      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert('Sesión no válida. Inicia sesión y vuelve a intentar.');
        return;
      }

      const res = await fetch(`${location.origin}/api/integrations/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          brand_container_id: brandId,
          platform: normalizedProvider
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `No se pudo desconectar (${res.status})`);
      }

      await this.loadData();
      this._refreshInfoPanelIfOpen();
    } catch (error) {
      console.error('BrandstorageView disconnectBrandIntegration:', error);
      alert(error?.message || 'No se pudo desconectar la integración.');
    } finally {
      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = actionButton.dataset.originalText || 'Desconectar';
      }
    }
    },

  setupBrandContainerInfoPanelEditables(panelRoot, brandContainerId) {
    if (!panelRoot || !brandContainerId) return;

    panelRoot.querySelectorAll('.info-connect-action.is-connect[data-connect-provider][data-brand-container-id]').forEach((btn) => {
      if (btn.dataset.boundConnectAction === '1') return;
      btn.dataset.boundConnectAction = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const provider = btn.getAttribute('data-connect-provider');
        const targetBrandId = btn.getAttribute('data-brand-container-id') || brandContainerId;
        await this.startBrandIntegrationOAuth(provider, targetBrandId, btn);
      });
    });

    panelRoot.querySelectorAll('.info-connect-action.is-disconnect[data-disconnect-provider][data-brand-container-id]').forEach((btn) => {
      if (btn.dataset.boundDisconnectAction === '1') return;
      btn.dataset.boundDisconnectAction = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const provider = btn.getAttribute('data-disconnect-provider');
        const targetBrandId = btn.getAttribute('data-brand-container-id') || brandContainerId;
        await this.disconnectBrandIntegration(provider, targetBrandId, btn);
      });
    });

    panelRoot.querySelectorAll('.info-brand-single-select[data-brand-field][data-brand-input-type="single-select"]').forEach((wrap) => {
      if (wrap.dataset.boundEditable === '1') return;
      wrap.dataset.boundEditable = '1';
      const field = wrap.getAttribute('data-brand-field');
      const trigger = wrap.querySelector('.info-brand-single-select__trigger');
      const valueEl = wrap.querySelector('.info-brand-single-select__value');
      const panel = wrap.querySelector('.info-brand-single-select__panel');
      const optionButtons = Array.from(wrap.querySelectorAll('.info-brand-single-select__option'));
      if (!field || !trigger || !valueEl || !panel || !optionButtons.length) return;

      let selected = String(wrap.getAttribute('data-selected') || '');

      const syncUi = () => {
        optionButtons.forEach((btn) => {
          const val = String(btn.getAttribute('data-value') || '');
          const isSelected = val === selected;
          btn.classList.toggle('is-selected', isSelected);
          const check = btn.querySelector('.info-brand-single-select__check');
          if (check) check.textContent = isSelected ? '✓' : '';
        });
        valueEl.textContent = field === 'nicho_core'
          ? BrandstorageView.getNichoCoreLabel(selected)
          : (selected || 'Seleccionar');
        wrap.setAttribute('data-selected', selected);
      };

      const closeOtherDropdowns = () => {
        panelRoot.querySelectorAll('.info-brand-multiselect.is-open, .info-brand-single-select.is-open').forEach((otherWrap) => {
          if (otherWrap === wrap) return;
          otherWrap.classList.remove('is-open');
          const otherTrigger = otherWrap.querySelector('.info-brand-multiselect__trigger, .info-brand-single-select__trigger');
          const otherPanel = otherWrap.querySelector('.info-brand-multiselect__panel, .info-brand-single-select__panel');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
          if (otherPanel) otherPanel.hidden = true;
        });
      };

      const setOpen = (open) => {
        if (open) closeOtherDropdowns();
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
        wrap.classList.toggle('is-open', open);
      };

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(panel.hidden);
      });
      trigger.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(panel.hidden);
      });

      optionButtons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = String(btn.getAttribute('data-value') || '').trim();
          selected = val;
          syncUi();
          await this.saveBrandContainerFieldById(brandContainerId, field, selected);
          setOpen(false);
        });
      });

      const closeOnOutside = (ev) => {
        if (!wrap.contains(ev.target)) setOpen(false);
      };
      document.addEventListener('click', closeOnOutside, true);
      if (!this._brandInfoPanelDisposers) this._brandInfoPanelDisposers = [];
      this._brandInfoPanelDisposers.push(() => document.removeEventListener('click', closeOnOutside, true));
      syncUi();
    });

    panelRoot.querySelectorAll('.info-brand-multiselect[data-brand-field][data-brand-input-type="array-multiselect"]').forEach((wrap) => {
      if (wrap.dataset.boundEditable === '1') return;
      wrap.dataset.boundEditable = '1';
      const field = wrap.getAttribute('data-brand-field');
      const trigger = wrap.querySelector('.info-brand-multiselect__trigger');
      const valueEl = wrap.querySelector('.info-brand-multiselect__value');
      const panel = wrap.querySelector('.info-brand-multiselect__panel');
      const optionButtons = Array.from(wrap.querySelectorAll('.info-brand-multiselect__option'));
      if (!field || !trigger || !valueEl || !panel || !optionButtons.length) return;

      let selected = [];
      try {
        selected = JSON.parse(wrap.getAttribute('data-selected') || '[]');
      } catch (_) {
        selected = [];
      }
      selected = Array.isArray(selected) ? selected.map((v) => String(v).trim()).filter(Boolean) : [];
      selected = this.normalizeBrandArrayValues(field, selected);

      const syncUi = () => {
        const set = new Set(selected);
        optionButtons.forEach((btn) => {
          const val = String(btn.getAttribute('data-value') || '');
          const isSelected = set.has(val);
          btn.classList.toggle('is-selected', isSelected);
          const check = btn.querySelector('.info-brand-multiselect__check');
          if (check) check.textContent = isSelected ? '✓' : '';
        });
        valueEl.innerHTML = selected.length
          ? selected
              .map((value) => `
                <span class="info-brand-multiselect__chip">
                  <span class="info-brand-multiselect__chip-label">${this.escapeHtml(this.getBrandArrayValueLabel(field, value))}</span>
                  <button type="button" class="info-brand-multiselect__chip-remove" data-value="${this.escapeHtml(value)}" aria-label="Quitar ${this.escapeHtml(this.getBrandArrayValueLabel(field, value))}">×</button>
                </span>
              `)
              .join('')
          : '<span class="info-brand-multiselect__placeholder">Seleccionar</span>';
        wrap.setAttribute('data-selected', JSON.stringify(selected));
      };

      const setOpen = (open) => {
        // Permitir solo un multiselect abierto a la vez dentro del panel INFO
        if (open) {
          panelRoot.querySelectorAll('.info-brand-multiselect.is-open, .info-brand-single-select.is-open').forEach((otherWrap) => {
            if (otherWrap === wrap) return;
            otherWrap.classList.remove('is-open');
            const otherTrigger = otherWrap.querySelector('.info-brand-multiselect__trigger, .info-brand-single-select__trigger');
            const otherPanel = otherWrap.querySelector('.info-brand-multiselect__panel, .info-brand-single-select__panel');
            if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
            if (otherPanel) otherPanel.hidden = true;
          });
        }
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
        wrap.classList.toggle('is-open', open);
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(panel.hidden);
      });

      optionButtons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = String(btn.getAttribute('data-value') || '').trim();
          if (!val) return;
          if (selected.includes(val)) selected = selected.filter((v) => v !== val);
          else selected = [...selected, val];
          syncUi();
          await this.saveBrandContainerFieldById(brandContainerId, field, selected);
        });
      });

      if (wrap.dataset.boundChipRemove === '1') return;
      wrap.dataset.boundChipRemove = '1';
      valueEl.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.info-brand-multiselect__chip-remove');
        if (!removeBtn || !valueEl.contains(removeBtn)) return;
        e.preventDefault();
        e.stopPropagation();
        const value = String(removeBtn.getAttribute('data-value') || '').trim();
        if (!value) return;
        selected = selected.filter((v) => v !== value);
        syncUi();
        await this.saveBrandContainerFieldById(brandContainerId, field, selected);
      });

      const closeOnOutside = (ev) => {
        if (!wrap.contains(ev.target)) setOpen(false);
      };
      document.addEventListener('click', closeOnOutside, true);
      if (!this._brandInfoPanelDisposers) this._brandInfoPanelDisposers = [];
      this._brandInfoPanelDisposers.push(() => document.removeEventListener('click', closeOnOutside, true));
      syncUi();
    });

    panelRoot.querySelectorAll('[data-brand-field]').forEach((el) => {
      if (el.dataset.boundEditable === '1') return;
      el.dataset.boundEditable = '1';
      const field = el.getAttribute('data-brand-field');
      const type = el.getAttribute('data-brand-input-type') || 'text';
      if (type === 'array-multiselect') return;
      const onSave = async () => {
        let nextValue = '';
        if (type === 'json') {
          const raw = String(el.value || '').trim();
          try {
            nextValue = raw ? JSON.parse(raw) : {};
          } catch (_) {
            alert(`JSON no válido en ${field}.`);
            return;
          }
        } else if (type === 'array') {
          nextValue = String(el.value || '')
            .split(/,|\n/)
            .map((v) => v.trim())
            .filter(Boolean);
        } else if (type === 'text') {
          nextValue = String(el.textContent || '').trim();
        } else {
          nextValue = String(el.value || '').trim();
        }
        await this.saveBrandContainerFieldById(brandContainerId, field, nextValue);
      };

      if (type === 'select') el.addEventListener('change', onSave);
      else el.addEventListener('blur', onSave);
    });

    panelRoot.querySelectorAll('[data-integration-id][data-integration-field]').forEach((el) => {
      if (el.dataset.boundEditable === '1') return;
      el.dataset.boundEditable = '1';
      const integrationId = el.getAttribute('data-integration-id');
      const field = el.getAttribute('data-integration-field');
      const handler = async () => {
        const value = field === 'is_active' ? String(el.value || '0') : String(el.value || '');
        await this.saveBrandIntegrationField(integrationId, field, value);
      };
      if (field === 'is_active') el.addEventListener('change', handler);
      else el.addEventListener('blur', handler);
    });

    panelRoot.querySelectorAll('[data-entity-id][data-entity-field]').forEach((el) => {
      if (el.dataset.boundEditable === '1') return;
      el.dataset.boundEditable = '1';
      const entityId = el.getAttribute('data-entity-id');
      const field = el.getAttribute('data-entity-field');
      el.addEventListener('blur', async () => {
        const value = String(el.value || '').trim();
        await this.saveBrandEntityField(entityId, field, value);
      });
    });
    },

  closeBrandContainerInfoPanel() {
    const container = this.container || document.getElementById('app-container');
    if (!container) return;
    const dashboardContainer = container.querySelector('.brand-dashboard-container') || container;
    const panel = dashboardContainer.querySelector('.brand-card.card-info.expanded.brand-storage-item-info-panel');
    if (!panel) return;

    panel.style.opacity = '0';
    panel.style.transform = 'scale(0.97) translateY(-10px)';
    setTimeout(() => {
      panel.remove();
      dashboardContainer.classList.remove('info-mode-secondary');
      if (Array.isArray(this._brandInfoPanelDisposers)) {
        this._brandInfoPanelDisposers.forEach((fn) => {
          try { fn(); } catch (_) {}
        });
      }
      this._brandInfoPanelDisposers = [];
      this.brandContainerInfoState = null;
    }, 220);
    },

  // ============================================
  // PANEL INFO EXPANDIDO
  // ============================================

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
    const infoCard = root?.querySelector('.brand-card.card-info.expanded.brand-storage-item-info-panel');
    if (!infoCard) return;
    const itemId = String(infoCard.getAttribute('data-brand-container-id') || '').trim();
    const item = (this.brandContainers || []).find((row) => String(row.id) === itemId);
    if (!item) return;
    const content = infoCard.querySelector('#infoPanelContent');
    if (content) {
      content.innerHTML = this.renderBrandContainerInfoContent(item);
      this.setupBrandContainerInfoPanelEditables(infoCard, item.id);
      if (typeof this.updateLinksForRouter === 'function') {
        this.updateLinksForRouter();
      }
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
    const brandContainer = this.brandContainerData;
    container.innerHTML = `
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
    const jsonFields = BrandstorageView.BRAND_JSON_FIELDS;
    const arrFields = BrandstorageView.BRAND_ARRAY_FIELDS;

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

    if (BrandstorageView.BRAND_TEXTAREA_FIELDS.includes(fieldName) || BrandstorageView.BRAND_TEXT_FIELDS.includes(fieldName)) {
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
      valueEl.textContent = BrandstorageView.getNichoCoreLabel(cur);
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

  // El último método no debe llevar coma final; el sed de arriba añade coma a todos los
  // cierres de método. Arreglamos el último sacando la coma del prototype assign:
  // eliminamos la coma que queda justo antes del cierre del objeto.
  Object.assign(BrandstorageView.prototype, InfoPanelMixin);
})();
