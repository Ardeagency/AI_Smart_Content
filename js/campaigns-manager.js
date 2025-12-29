/**
 * Campaigns Manager
 * Maneja la creación, edición y eliminación de campañas
 */

class CampaignsManager {
    constructor(supabase, userId, projectId) {
        this.supabase = supabase;
        this.userId = userId;
        this.projectId = projectId;
        this.campaigns = [];
    }

    /**
     * Cargar todas las campañas del proyecto
     * @returns {Promise<Array>} - Array de campañas
     */
    async loadCampaigns() {
        if (!this.supabase || !this.projectId) {
            console.warn('⚠️ Supabase o projectId no disponible');
            return [];
        }

        try {
            const { data, error } = await this.supabase
                .from('campaigns')
                .select('*')
                .eq('project_id', this.projectId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error cargando campañas:', error);
                return [];
            }

            this.campaigns = data || [];
            console.log(`✅ ${this.campaigns.length} campaña(s) cargada(s)`);
            return this.campaigns;
        } catch (error) {
            console.error('❌ Error en loadCampaigns:', error);
            return [];
        }
    }

    /**
     * Crear una nueva campaña
     * @param {Object} campaignData - Datos de la campaña
     * @returns {Promise<Object|null>} - Campaña creada o null si hay error
     */
    async createCampaign(campaignData) {
        if (!this.supabase || !this.projectId) {
            throw new Error('Supabase o projectId no disponible');
        }

        // Validar datos requeridos
        if (!campaignData.audiencia_desc || !campaignData.objetivo_principal || !campaignData.cta || !campaignData.cta_url) {
            throw new Error('Faltan campos requeridos: audiencia_desc, objetivo_principal, cta, cta_url');
        }

        try {
            const { data, error } = await this.supabase
                .from('campaigns')
                .insert({
                    project_id: this.projectId,
                    oferta_desc: campaignData.oferta_desc || null,
                    audiencia_desc: campaignData.audiencia_desc,
                    intenciones: campaignData.intenciones || null,
                    objetivo_principal: campaignData.objetivo_principal,
                    cta: campaignData.cta,
                    cta_url: campaignData.cta_url
                })
                .select()
                .single();

            if (error) {
                console.error('❌ Error creando campaña:', error);
                throw error;
            }

            console.log('✅ Campaña creada:', data);
            this.campaigns.unshift(data); // Agregar al inicio
            return data;
        } catch (error) {
            console.error('❌ Error en createCampaign:', error);
            throw error;
        }
    }

    /**
     * Actualizar una campaña existente
     * @param {string} campaignId - ID de la campaña
     * @param {Object} campaignData - Datos actualizados
     * @returns {Promise<Object|null>} - Campaña actualizada o null si hay error
     */
    async updateCampaign(campaignId, campaignData) {
        if (!this.supabase) {
            throw new Error('Supabase no disponible');
        }

        // Validar datos requeridos
        if (!campaignData.audiencia_desc || !campaignData.objetivo_principal || !campaignData.cta || !campaignData.cta_url) {
            throw new Error('Faltan campos requeridos: audiencia_desc, objetivo_principal, cta, cta_url');
        }

        try {
            const { data, error } = await this.supabase
                .from('campaigns')
                .update({
                    oferta_desc: campaignData.oferta_desc || null,
                    audiencia_desc: campaignData.audiencia_desc,
                    intenciones: campaignData.intenciones || null,
                    objetivo_principal: campaignData.objetivo_principal,
                    cta: campaignData.cta,
                    cta_url: campaignData.cta_url,
                    updated_at: new Date().toISOString()
                })
                .eq('id', campaignId)
                .select()
                .single();

            if (error) {
                console.error('❌ Error actualizando campaña:', error);
                throw error;
            }

            console.log('✅ Campaña actualizada:', data);
            
            // Actualizar en el array local
            const index = this.campaigns.findIndex(c => c.id === campaignId);
            if (index !== -1) {
                this.campaigns[index] = data;
            }

            return data;
        } catch (error) {
            console.error('❌ Error en updateCampaign:', error);
            throw error;
        }
    }

    /**
     * Eliminar una campaña
     * @param {string} campaignId - ID de la campaña
     * @returns {Promise<boolean>} - True si se eliminó correctamente
     */
    async deleteCampaign(campaignId) {
        if (!this.supabase) {
            throw new Error('Supabase no disponible');
        }

        try {
            const { error } = await this.supabase
                .from('campaigns')
                .delete()
                .eq('id', campaignId);

            if (error) {
                console.error('❌ Error eliminando campaña:', error);
                throw error;
            }

            console.log('✅ Campaña eliminada:', campaignId);
            
            // Remover del array local
            this.campaigns = this.campaigns.filter(c => c.id !== campaignId);

            return true;
        } catch (error) {
            console.error('❌ Error en deleteCampaign:', error);
            throw error;
        }
    }

    /**
     * Obtener una campaña por ID
     * @param {string} campaignId - ID de la campaña
     * @returns {Object|null} - Campaña o null si no existe
     */
    getCampaignById(campaignId) {
        return this.campaigns.find(c => c.id === campaignId) || null;
    }

    /**
     * Mostrar modal para crear/editar campaña
     * @param {Object|null} campaign - Campaña a editar (null para crear nueva)
     */
    showCampaignModal(campaign = null) {
        const isEdit = campaign !== null;
        const modal = document.createElement('div');
        modal.className = 'campaign-modal-overlay';
        modal.innerHTML = `
            <div class="campaign-modal">
                <div class="campaign-modal-header">
                    <h3>${isEdit ? 'Editar Campaña' : 'Nueva Campaña'}</h3>
                    <button class="campaign-modal-close" onclick="this.closest('.campaign-modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="campaign-modal-body">
                    <form id="campaignForm">
                        <div class="campaign-form-field">
                            <label for="objetivo_principal">Objetivo Principal <span class="required">*</span></label>
                            <input type="text" id="objetivo_principal" name="objetivo_principal" 
                                   value="${campaign?.objetivo_principal || ''}" 
                                   placeholder="Ej: Aumentar ventas en línea" required>
                        </div>
                        
                        <div class="campaign-form-field">
                            <label for="audiencia_desc">Audiencia <span class="required">*</span></label>
                            <textarea id="audiencia_desc" name="audiencia_desc" rows="3" 
                                      placeholder="Describe la audiencia objetivo..." required>${campaign?.audiencia_desc || ''}</textarea>
                        </div>
                        
                        <div class="campaign-form-field">
                            <label for="oferta_desc">Oferta (opcional)</label>
                            <textarea id="oferta_desc" name="oferta_desc" rows="2" 
                                      placeholder="Describe la oferta o promoción...">${campaign?.oferta_desc || ''}</textarea>
                        </div>
                        
                        <div class="campaign-form-field">
                            <label for="intenciones">Intenciones (opcional)</label>
                            <textarea id="intenciones" name="intenciones" rows="2" 
                                      placeholder="Describe las intenciones de la campaña...">${campaign?.intenciones || ''}</textarea>
                        </div>
                        
                        <div class="campaign-form-field">
                            <label for="cta">Texto del CTA <span class="required">*</span></label>
                            <input type="text" id="cta" name="cta" 
                                   value="${campaign?.cta || ''}" 
                                   placeholder="Ej: Comprar ahora" required>
                        </div>
                        
                        <div class="campaign-form-field">
                            <label for="cta_url">URL del CTA <span class="required">*</span></label>
                            <input type="url" id="cta_url" name="cta_url" 
                                   value="${campaign?.cta_url || ''}" 
                                   placeholder="https://ejemplo.com" required>
                        </div>
                        
                        <div class="campaign-form-actions">
                            <button type="button" class="btn btn-secondary" 
                                    onclick="this.closest('.campaign-modal-overlay').remove()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                ${isEdit ? 'Actualizar' : 'Crear'} Campaña
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Manejar envío del formulario
        const form = modal.querySelector('#campaignForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCampaignSubmit(form, campaign?.id);
        });

        // Cerrar al hacer clic fuera del modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Manejar envío del formulario de campaña
     * @param {HTMLFormElement} form - Formulario
     * @param {string|null} campaignId - ID de la campaña (null para crear)
     */
    async handleCampaignSubmit(form, campaignId = null) {
        const formData = new FormData(form);
        const campaignData = {
            objetivo_principal: formData.get('objetivo_principal'),
            audiencia_desc: formData.get('audiencia_desc'),
            oferta_desc: formData.get('oferta_desc') || null,
            intenciones: formData.get('intenciones') || null,
            cta: formData.get('cta'),
            cta_url: formData.get('cta_url')
        };

        try {
            if (campaignId) {
                await this.updateCampaign(campaignId, campaignData);
                this.showNotification('✅ Campaña actualizada exitosamente', 'success');
            } else {
                await this.createCampaign(campaignData);
                this.showNotification('✅ Campaña creada exitosamente', 'success');
            }

            // Cerrar modal
            form.closest('.campaign-modal-overlay').remove();

            // Recargar campañas y actualizar UI
            await this.loadCampaigns();
            if (window.livingManager && window.livingManager.renderCampaigns) {
                window.livingManager.renderCampaigns();
            }
        } catch (error) {
            console.error('Error guardando campaña:', error);
            this.showNotification('❌ Error: ' + error.message, 'error');
        }
    }

    /**
     * Mostrar notificación
     * @param {string} message - Mensaje
     * @param {string} type - Tipo (success, error, info)
     */
    showNotification(message, type = 'info') {
        // Implementación simple de notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-size: 0.875rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Exportar para uso global
window.CampaignsManager = CampaignsManager;

