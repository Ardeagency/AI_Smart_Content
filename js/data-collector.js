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

        // Limpiar producto - mapear campos del schema a formato esperado
        let productoEnviado = null;
        if (producto) {
            productoEnviado = {
                id: producto.id,
                brand_container_id: producto.brand_container_id,
                name: producto.nombre_producto,
                product_type: producto.tipo_producto,
                short_desc: producto.descripcion_producto,
                benefits: Array.isArray(producto.beneficios) ? producto.beneficios : [],
                differentiators: producto.diferenciacion,
                usage_steps: producto.modo_uso,
                ingredients: producto.ingredientes,
                price: producto.precio_producto,
                currency: producto.moneda || 'USD',
                variants: producto.variantes_producto,
                imagenes: Array.isArray(producto.imagenes) ? producto.imagenes.map(img => img.image_url) : []
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
        const aiDefined = this.getCheckboxValue('ai-protagonist-toggle');
        
        // Si la IA define el protagonista, solo enviar ai_defined: true y el resto en null
        if (aiDefined) {
            return {
                ai_defined: true,
                gender: null,
                age: null,
                ethnicity: null,
                eyes: null,
                hair: null,
                expression: null,
                style: null,
                tone: null,
                personality: null,
                aesthetic: null,
                realism: null,
                language: null,
                accent: null
            };
        }
        
        // Si no está definido por IA, enviar todos los datos
        return {
            ai_defined: false,
            gender: this.getSegmentedControlValue('gender-selector'),
            age: this.getSliderValue('age-slider'),
            ethnicity: this.getTextInputValue('ethnicity-search'),
            eyes: this.getChipSelectorValue('eyes-selector'),
            hair: this.getSelectValue('hair-selector'),
            expression: this.getChipSelectorValue('expression-selector'),
            style: this.getSelectValue('style-selector'),
            tone: this.getToneValue(), // String con preset o valor numérico
            personality: this.getMultiChipSelectorValue('personality-selector'),
            aesthetic: this.getSelectValue('aesthetic-selector'),
            realism: this.getRealismValue(), // String con presets o valor numérico
            language: this.getSelectValue('language-selector'),
            accent: this.getSelectValue('accent-selector')
        };
    }

    /**
     * Recolectar información del escenario y ambiente
     * @returns {Object} - Datos del escenario
     */
    collectScenarioInfo() {
        const aiDefined = this.getCheckboxValue('ai-scenario-toggle');
        
        // Si la IA define el escenario, solo enviar ai_defined: true y el resto en null
        if (aiDefined) {
            return {
                ai_defined: true,
                visual_tone: null,
                ambience: null,
                location: null,
                time: null,
                visual_realism: null
            };
        }
        
        // Si no está definido por IA, enviar todos los datos
        return {
            ai_defined: false,
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
        if (!this.supabase) {
            console.warn('⚠️ Supabase no disponible para obtener datos de marca');
            return null;
        }

        // Obtener el project_id del selector
        const projectId = this.getSelectValue('brand-selector');
        if (!projectId) {
            console.log('ℹ️ No hay marca seleccionada');
            return null;
        }

        try {
            // Obtener datos del proyecto (marca)
            const { data: project, error: projectError } = await this.supabase
                .from('brand_containers')
                .select('*')
                .eq('id', projectId)
                .maybeSingle();

            if (projectError) {
                console.error('❌ Error obteniendo proyecto:', projectError);
                return null;
            }

            if (!project) {
                console.log('ℹ️ Proyecto no encontrado');
                return null;
            }

            // Obtener datos de la tabla brands
            const { data: brand, error: brandError } = await this.supabase
                .from('brands')
                .select('*')
                .eq('project_id', projectId)
                .maybeSingle();

            if (brandError) {
                console.error('❌ Error obteniendo brand:', brandError);
            }

            // Combinar datos del proyecto y brand
            return {
                id: project.id,
                nombre_marca: project.nombre_marca,
                logo_url: project.logo_url,
                sitio_web: project.sitio_web,
                instagram_url: project.instagram_url,
                tiktok_url: project.tiktok_url,
                facebook_url: project.facebook_url,
                idiomas_contenido: project.idiomas_contenido,
                mercado_objetivo: project.mercado_objetivo,
                // Datos de la tabla brands
                tono_voz: brand?.tono_voz || null,
                palabras_usar: brand?.palabras_usar || null,
                palabras_evitar: brand?.palabras_evitar || [],
                reglas_creativas: brand?.reglas_creativas || null,
                personalidad_marca: brand?.personalidad_marca || null,
                quienes_somos: brand?.quienes_somos || null,
                objetivos_marca: brand?.objetivos_marca || []
            };
        } catch (error) {
            console.error('❌ Error en getMarcaInfo:', error);
            return null;
        }
    }

    /**
     * Obtener datos de producto desde Supabase
     * @returns {Promise<Object|null>} - Datos del producto
     */
    async getProductInfo() {
        if (!this.supabase) {
            console.warn('⚠️ Supabase no disponible para obtener datos de producto');
            return null;
        }

        // Obtener el product_id del selector
        const productId = this.getSelectValue('product-selector');
        if (!productId) {
            console.log('ℹ️ No hay producto seleccionado');
            return null;
        }

        try {
            // Obtener datos del producto
            const { data: product, error: productError } = await this.supabase
                .from('products')
                .select('*')
                .eq('id', productId)
                .maybeSingle();

            if (productError) {
                console.error('❌ Error obteniendo producto:', productError);
                return null;
            }

            if (!product) {
                console.log('ℹ️ Producto no encontrado');
                return null;
            }

            // Obtener imágenes del producto
            const { data: images, error: imagesError } = await this.supabase
                .from('product_images')
                .select('*')
                .eq('product_id', productId)
                .order('image_order', { ascending: true });

            if (imagesError) {
                console.error('❌ Error obteniendo imágenes del producto:', imagesError);
            }

            // Combinar beneficios en un array
            const benefits = [];
            if (product.beneficio_1) benefits.push(product.beneficio_1);
            if (product.beneficio_2) benefits.push(product.beneficio_2);
            if (product.beneficio_3) benefits.push(product.beneficio_3);

            return {
                id: product.id,
                brand_container_id: product.brand_container_id,
                tipo_producto: product.tipo_producto,
                nombre_producto: product.nombre_producto,
                descripcion_producto: product.descripcion_producto,
                beneficios: benefits,
                diferenciacion: product.diferenciacion,
                modo_uso: product.modo_uso,
                ingredientes: product.ingredientes,
                precio_producto: product.precio_producto,
                moneda: product.moneda || 'USD',
                variantes_producto: product.variantes_producto,
                imagenes: (images || []).map(img => ({
                    id: img.id,
                    image_url: img.image_url,
                    image_type: img.image_type,
                    image_order: img.image_order
                }))
            };
        } catch (error) {
            console.error('❌ Error en getProductInfo:', error);
            return null;
        }
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
        
        // Buscar chip activo (clase .chip.active)
        const activeChip = container.querySelector('.chip.active');
        if (activeChip) {
            return activeChip.getAttribute('data-value') || activeChip.textContent.trim();
        }
        
        // Si no hay chip, buscar eye-swatch activo (para color de ojos)
        const activeSwatch = container.querySelector('.eye-swatch.active');
        if (activeSwatch) {
            return activeSwatch.getAttribute('data-value') || activeSwatch.getAttribute('data-label') || null;
        }
        
        return null;
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
     * Obtener valor de tono como string (preset seleccionado o valor numérico)
     * @returns {string|null} - Valor del tono (preset o número)
     */
    getToneValue() {
        // Primero verificar si hay un preset activo
        const activePreset = document.querySelector('.tone-preset-btn.active');
        if (activePreset) {
            const presetValue = activePreset.getAttribute('data-value');
            const sliderValue = this.getSliderValue('tone-slider');
            // Retornar preset con valor numérico: "preset-numero"
            return `${presetValue}-${sliderValue}`;
        }
        
        // Si no hay preset, retornar solo el valor numérico como string
        const sliderValue = this.getSliderValue('tone-slider');
        return sliderValue !== null ? String(sliderValue) : null;
    }

    /**
     * Obtener valor de realismo como string (presets seleccionados o valor numérico)
     * @returns {string|null} - Valor del realismo (presets separados por comas o número)
     */
    getRealismValue() {
        // Primero verificar si hay presets activos
        const activePresets = document.querySelectorAll('.realism-preset-btn.active');
        if (activePresets.length > 0) {
            const presetValues = Array.from(activePresets)
                .map(btn => btn.getAttribute('data-value'))
                .filter(Boolean);
            const sliderValue = this.getSliderValue('realism-slider');
            // Retornar presets con valor numérico: "preset1,preset2-numero"
            return `${presetValues.join(',')}-${sliderValue}`;
        }
        
        // Si no hay presets, retornar solo el valor numérico como string
        const sliderValue = this.getSliderValue('realism-slider');
        return sliderValue !== null ? String(sliderValue) : null;
    }

    /**
     * Validar datos requeridos
     * @param {Object} data - Datos a validar
     * @returns {Object} - { valid: boolean, message: string } - Resultado de la validación
     */
    validateRequiredData(data) {
        // Validar que haya un producto seleccionado (OBLIGATORIO)
        if (!data.producto || !data.producto.id) {
            return {
                valid: false,
                message: 'Por favor, selecciona un producto antes de generar contenido.'
            };
        }
        
        // Validar datos básicos del sujeto (si no está definido por IA)
        if (data.sujeto && data.sujeto.ai_defined) {
            // Si la IA define el protagonista, no se requieren campos específicos
            return { valid: true, message: '' };
        }
        
        // Si no está definido por IA, validar campos básicos
        const required = [
            data.sujeto && data.sujeto.gender,
            data.sujeto && data.sujeto.age
        ];
        
        const isValid = required.every(value => value && value !== '');
        
        if (!isValid) {
            return {
                valid: false,
                message: 'Por favor, completa los campos requeridos del protagonista (género y edad).'
            };
        }
        
        return { valid: true, message: '' };
    }
}

// Exportar para uso global
window.DataCollector = DataCollector;
