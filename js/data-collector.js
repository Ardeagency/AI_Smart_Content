/**
 * Data Collector
 * Maneja la recolección de datos del sidebar para enviar al webhook
 */

class DataCollector {
    constructor(supabase, userId) {
        // Supabase desactivado
        this.supabase = null;
        this.userId = userId;
    }

    /**
     * Recolectar todos los datos del sidebar
     * @returns {Promise<Object>} - Datos completos para el webhook
     */
    async collectAllSidebarData() {
        // Obtener datos completos de Supabase
        const [marca, producto, oferta, audiencia, imagenes] = await Promise.all([
            this.getMarcaInfo(),
            this.getProductInfo(),
            this.getOfferInfo(),
            this.getAudienceInfo(),
            this.collectSelectedImages()
        ]);

        // Limpiar producto - solo enviar campos necesarios
        let productoEnviado = null;
        if (producto) {
            productoEnviado = {
                id: producto.id,
                project_id: producto.project_id,
                name: producto.name,
                product_type: producto.product_type,
                short_desc: producto.short_desc,
                benefits: producto.benefits,
                differentiators: producto.differentiators,
                usage_steps: producto.usage_steps,
                ingredients: producto.ingredients,
                price: producto.price,
                variants: producto.variants,
                imagenes: Array.isArray(imagenes) ? imagenes : []
            };
        }
        
        return {
            marca: marca,
            producto: productoEnviado,
            sujeto: this.collectSubjectInfo(),
            escenario: this.collectScenarioInfo(),
            oferta: this.collectOfferAndAudienceInfo().offer || oferta,
            audiencia: this.collectOfferAndAudienceInfo().audience || audiencia,
            configuracion_avanzada: this.collectAdvancedConfig(),
            metadata: {
                timestamp: new Date().toISOString(),
                user_id: this.userId,
                version: '1.0'
            }
        };
    }

    /**
     * Recolectar información del sujeto/protagonista
     * @returns {Object} - Datos del sujeto
     */
    collectSubjectInfo() {
        return {
            ai_defined: this.getCheckboxValue('ai-protagonist-toggle'),
            gender: this.getSegmentedControlValue('gender-selector'),
            age: this.getSliderValue('age-slider'),
            ethnicity: this.getTextInputValue('ethnicity-search'),
            eyes: this.getChipSelectorValue('eyes-selector'),
            hair: this.getSelectValue('hair-selector'),
            expression: this.getChipSelectorValue('expression-selector'),
            style: this.getSelectValue('style-selector'),
            tone: this.getSliderValue('tone-slider'),
            personality: this.getMultiChipSelectorValue('personality-selector'),
            aesthetic: this.getSelectValue('aesthetic-selector'),
            realism: this.getSliderValue('realism-slider'),
            language: this.getSelectValue('language-selector'),
            accent: this.getSelectValue('accent-selector')
        };
    }

    /**
     * Recolectar información del escenario y ambiente
     * @returns {Object} - Datos del escenario
     */
    collectScenarioInfo() {
        return {
            ai_defined: this.getCheckboxValue('ai-scenario-toggle'),
            visual_tone: this.getChipSelectorValue('visual-tone-selector'),
            ambience: this.getChipSelectorValue('ambience-selector'),
            location: this.getSelectValue('location-selector'),
            time: this.getSegmentedControlValue('time-selector'),
            visual_realism: this.getSliderValue('visual-realism-slider')
        };
    }

    /**
     * Recolectar configuración avanzada
     * @returns {Object} - Configuración avanzada
     */
    collectAdvancedConfig() {
        return {
            resolution: this.getSelectValue('resolution-selector'),
            ratio: this.getSelectValue('ratio-selector'),
            creativity: this.getSliderValue('creativity-slider'),
            prompt: this.getTextareaValue('prompt-input'),
            negative_prompt: this.getTextareaValue('negative-prompt-input')
        };
    }

    /**
     * Recolectar información de oferta y audiencia
     * @returns {Object} - Datos de oferta y audiencia
     */
    collectOfferAndAudienceInfo() {
        return {
            offer: this.getSelectValue('offer-selector'),
            audience: this.getSelectValue('audience-selector')
        };
    }

    /**
     * Recolectar todas las imágenes del producto seleccionado como URLs
     * @returns {Promise<Array>} - Array de URLs de imágenes
     */
    async collectSelectedImages() {
        return [];
    }

    /**
     * Obtener datos de marca desde Supabase
     * @returns {Promise<Object|null>} - Datos de la marca
     */
    async getMarcaInfo() {
                return null;
    }

    /**
     * Obtener datos de producto desde Supabase
     * @returns {Promise<Object|null>} - Datos del producto
     */
    async getProductInfo() {
                return null;
    }

    /**
     * Obtener datos de oferta desde Supabase
     * @returns {Promise<Object|null>} - Datos de la oferta
     */
    async getOfferInfo() {
        return null;
    }

    /**
     * Obtener datos de audiencia desde Supabase
     * @returns {Promise<Object|null>} - Datos de la audiencia
     */
    async getAudienceInfo() {
        return null;
    }

    /**
     * Obtener valor de un selector
     * @param {string} selectorId - ID del selector
     * @returns {string|null} - Valor seleccionado
     */
    getSelectValue(selectorId) {
        const element = document.getElementById(selectorId);
        return element ? element.value : null;
    }

    /**
     * Obtener valor de un slider
     * @param {string} sliderId - ID del slider
     * @returns {number|null} - Valor del slider
     */
    getSliderValue(sliderId) {
        const element = document.getElementById(sliderId);
        return element ? parseFloat(element.value) : null;
    }

    /**
     * Obtener valor de un textarea
     * @param {string} textareaId - ID del textarea
     * @returns {string|null} - Valor del textarea
     */
    getTextareaValue(textareaId) {
        const element = document.getElementById(textareaId);
        return element ? element.value.trim() || null : null;
    }

    /**
     * Obtener valor de un checkbox
     * @param {string} checkboxId - ID del checkbox
     * @returns {boolean} - Estado del checkbox
     */
    getCheckboxValue(checkboxId) {
        const element = document.getElementById(checkboxId);
        return element ? element.checked : false;
    }

    /**
     * Obtener valor de un segmented control (botones)
     * @param {string} selectorId - ID del contenedor
     * @returns {string|null} - Valor seleccionado
     */
    getSegmentedControlValue(selectorId) {
        const container = document.getElementById(selectorId);
        if (!container) return null;
        
        const activeButton = container.querySelector('.segment-btn.active');
        return activeButton ? activeButton.getAttribute('data-value') || activeButton.textContent.trim() : null;
    }

    /**
     * Obtener valor de un chip selector (un solo chip seleccionado)
     * @param {string} selectorId - ID del contenedor
     * @returns {string|null} - Valor seleccionado
     */
    getChipSelectorValue(selectorId) {
        const container = document.getElementById(selectorId);
        if (!container) return null;
        
        const activeChip = container.querySelector('.chip.active');
        return activeChip ? activeChip.getAttribute('data-value') || activeChip.textContent.trim() : null;
    }

    /**
     * Obtener valores de un multi-chip selector (múltiples chips seleccionados)
     * @param {string} selectorId - ID del contenedor
     * @returns {Array<string>} - Array de valores seleccionados
     */
    getMultiChipSelectorValue(selectorId) {
        const container = document.getElementById(selectorId);
        if (!container) return [];
        
        const activeChips = container.querySelectorAll('.chip.active');
        return Array.from(activeChips).map(chip => chip.getAttribute('data-value') || chip.textContent.trim()).filter(Boolean);
    }

    /**
     * Obtener valor de un input de texto
     * @param {string} inputId - ID del input
     * @returns {string|null} - Valor del input
     */
    getTextInputValue(inputId) {
        const element = document.getElementById(inputId);
        return element ? element.value.trim() || null : null;
    }

    /**
     * Validar datos requeridos
     * @param {Object} data - Datos a validar
     * @returns {boolean} - True si los datos son válidos
     */
    validateRequiredData(data) {
        // Ya no se requieren marca.id ni producto.id
        // Solo validamos que existan los datos básicos del sujeto (si no está definido por IA)
        if (data.sujeto && data.sujeto.ai_defined) {
            // Si la IA define el protagonista, no se requieren campos específicos
            return true;
        }
        
        // Si no está definido por IA, validar campos básicos
        const required = [
            data.sujeto && data.sujeto.gender,
            data.sujeto && data.sujeto.age
        ];
        
        return required.every(value => value && value !== '');
    }
}

// Exportar para uso global
window.DataCollector = DataCollector;
