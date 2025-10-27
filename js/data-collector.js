/**
 * Data Collector
 * Maneja la recolección de datos del sidebar para enviar al webhook
 */

class DataCollector {
    constructor(supabase, userId) {
        this.supabase = supabase;
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
            oferta: oferta,
            audiencia: audiencia,
            configuracion_avanzada: this.collectAdvancedConfig(),
            metadata: {
                timestamp: new Date().toISOString(),
                user_id: this.userId,
                version: '1.0'
            }
        };
    }

    /**
     * Recolectar información del sujeto
     * @returns {Object} - Datos del sujeto
     */
    collectSubjectInfo() {
        return {
            gender: this.getSelectValue('gender-selector'),
            age: this.getSelectValue('age-selector'),
            ethnicity: this.getSelectValue('ethnicity-selector'),
            eyes: this.getSelectValue('eyes-selector'),
            hair: this.getSelectValue('hair-selector'),
            expression: this.getSelectValue('expression-selector'),
            style: this.getSelectValue('style-selector'),
            tone: this.getSelectValue('tone-selector'),
            personality: this.getSelectValue('personality-selector'),
            aesthetic: this.getSelectValue('aesthetic-selector'),
            realism: this.getSelectValue('realism-selector'),
            language: this.getSelectValue('language-selector'),
            accent: this.getSelectValue('accent-selector')
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
     * Recolectar todas las imágenes del producto seleccionado como URLs
     * @returns {Promise<Array>} - Array de URLs de imágenes
     */
    async collectSelectedImages() {
        const productSelector = document.getElementById('product-selector');
        if (!productSelector || !productSelector.value || !this.supabase) {
            console.log('No hay producto seleccionado o Supabase no disponible');
            return [];
        }
        
        try {
            const productData = await this.getProductInfo();
            if (!productData) return [];
            
            const fileIds = [];
            if (productData.main_image_id) {
                fileIds.push(productData.main_image_id);
            }
            
            if (productData.gallery_file_ids && Array.isArray(productData.gallery_file_ids)) {
                productData.gallery_file_ids.forEach(id => {
                    if (id) fileIds.push(id);
                });
            }
            
            if (fileIds.length === 0) return [];
            
            const maxFiles = 10;
            const limitedFileIds = fileIds.slice(0, maxFiles);
            
            const { data: files, error } = await this.supabase
                .from('files')
                .select('*')
                .in('id', limitedFileIds);
            
            if (error || !files || files.length === 0) {
                return [];
            }
            
            const imageUrls = files
                .map(file => {
                    if (!file.path) return null;
                    return `https://ksjeikudvqseoosyhsdd.supabase.co/storage/v1/object/public/ugc/${file.path}`;
                })
                .filter(url => url !== null);
            
            return imageUrls;
            
        } catch (error) {
            return [];
        }
    }

    /**
     * Obtener datos de marca desde Supabase
     * @returns {Promise<Object|null>} - Datos de la marca
     */
    async getMarcaInfo() {
        const brandSelector = document.getElementById('brand-selector');
        if (!brandSelector || !brandSelector.value || !this.supabase) {
            console.log('No hay marca seleccionada o Supabase no disponible');
            return null;
        }
        
        try {
            console.log('Obteniendo datos de marca para ID:', brandSelector.value);
            const { data, error } = await this.supabase
                .from('brand_guidelines')
                .select(`
                    id,
                    project_id,
                    tone_of_voice,
                    keywords_yes,
                    keywords_no,
                    dos_donts,
                    reference_links,
                    projects!inner(
                        id,
                        name,
                        website,
                        country,
                        languages
                    )
                `)
                .eq('id', brandSelector.value)
                .single();
            
            if (error) {
                console.error('Error obteniendo datos de marca:', error);
                return null;
            }
            
            console.log('Datos de marca obtenidos:', data);
            return data;
        } catch (error) {
            console.error('Error en getMarcaInfo:', error);
            return null;
        }
    }

    /**
     * Obtener datos de producto desde Supabase
     * @returns {Promise<Object|null>} - Datos del producto
     */
    async getProductInfo() {
        const productSelector = document.getElementById('product-selector');
        if (!productSelector || !productSelector.value || !this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('products')
                .select('*')
                .eq('id', productSelector.value)
                .single();
            
            if (error) {
                console.error('Error obteniendo datos de producto:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error en getProductInfo:', error);
            return null;
        }
    }

    /**
     * Obtener datos de oferta desde Supabase
     * @returns {Promise<Object|null>} - Datos de la oferta
     */
    async getOfferInfo() {
        const offerSelector = document.getElementById('offer-selector');
        if (!offerSelector || !offerSelector.value || !this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('offers')
                .select('*')
                .eq('id', offerSelector.value)
                .single();
            
            if (error) {
                console.error('Error obteniendo datos de oferta:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error en getOfferInfo:', error);
            return null;
        }
    }

    /**
     * Obtener datos de audiencia desde Supabase
     * @returns {Promise<Object|null>} - Datos de la audiencia
     */
    async getAudienceInfo() {
        const audienceSelector = document.getElementById('audience-selector');
        if (!audienceSelector || !audienceSelector.value || !this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('audience')
                .select('*')
                .eq('id', audienceSelector.value)
                .single();
            
            if (error) {
                console.error('Error obteniendo datos de audiencia:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error en getAudienceInfo:', error);
            return null;
        }
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
        return element ? element.value : null;
    }

    /**
     * Validar datos requeridos
     * @param {Object} data - Datos a validar
     * @returns {boolean} - True si los datos son válidos
     */
    validateRequiredData(data) {
        const required = [
            data.marca && data.marca.id,
            data.producto && data.producto.id,
            data.sujeto && data.sujeto.gender,
            data.sujeto && data.sujeto.age
        ];
        
        return required.every(value => value && value !== '');
    }
}

// Exportar para uso global
window.DataCollector = DataCollector;
