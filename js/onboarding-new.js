// New Onboarding JavaScript - Complete UGC Setup (Standalone)
// VERSION 2 - Sin localStorage, sin saltos de pasos

console.log('🚀 CARGANDO VERSIÓN 2 - Sin localStorage');

class NewOnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 44;
        
        // Inicializar sin cargar datos locales
        this.currentStep = 1;
        
        // Si no hay datos guardados, inicializar con valores por defecto
        if (!this.formData) {
        this.formData = {
            // Sección 2: Proyecto inicial (Marca)
            nombre_marca: '',
            sitio_web: '',
            instagram_url: '',
            tiktok_url: '',
            mercado_objetivo: [],
            idiomas_contenido: [],
            
            // Sección 3: Lineamientos de marca
            tono_voz: '',
            palabras_usar: '',
            palabras_evitar: '',
            reglas_creativas: '',
            logo_file: null,
            brand_files: [],
            
            // Sección 4: Producto principal
            tipo_producto: '',
            nombre_producto: '',
            descripcion_producto: '',
            beneficio_1: '',
            beneficio_2: '',
            beneficio_3: '',
            diferenciacion: '',
            modo_uso: '',
            ingredientes: '',
            precio_producto: '',
            moneda: 'USD',
            variantes_producto: '',
            imagen_producto_1: null,
            imagen_producto_2: null,
            imagen_producto_3: null,
            imagen_producto_4: null,
            galeria_producto: [],
            
            // Sección 5: Avatar o Creador
            tipo_creador: '',
            rango_edad: '',
            genero_avatar: '',
            apariencia_fisica: '',
            energia_avatar: '',
            idiomas_avatar: [],
            valores_avatar: [],
            caracteristicas_voz: {},
            acento_voz: '',
            avatar_imagen_ref: null,
            avatar_video_ref: null,
            
            // Sección 6: Objetivos de Campaña (Offers)
            main_objective: '',
            offer_desc: '',
            cta: '',
            cta_url: '',
            kpis: [],
            
            // Sección 7: Audiencia Objetivo (Audience)
            buyer_persona: '',
            interests: '',
            pains: '',
            contexts: '',
            
            // Sección 8: Estética Audiovisual (Aesthetics)
            mood: '',
            lighting: '',
            camera: '',
            pace: '',
            
            // Sección 9: Distribución (Distribution)
            platforms: [],
            formats: [],
            
            // Sección 10: Escenarios (Scenarios)
            main_location: '',
            ambience: '',
            
            
            // Sección 12: Notas adicionales
            founder_prefs: '',
            restrictions: ''
            };
        }
        
        // REESTRUCTURACIÓN DE PASOS OPCIONALES BASADA EN LÓGICA DE NEGOCIO
        this.optionalSteps = [
            // MARCA - Opcionales
            2,   // Sitio web/redes sociales
            7,   // Palabras a evitar
            8,   // Reglas creativas
            10,  // Brand files adicionales
            // NOTA: Mercado objetivo (3) y idiomas (4) son OBLIGATORIOS
            
            // PRODUCTO - Opcionales  
            15,  // Diferenciación (nice to have)
            16,  // Modo de uso (puede no aplicar)
            17,  // Ingredientes (puede no aplicar)
            18,  // Precio (puede ser confidencial)
            19,  // Variantes del producto
            
            // AVATAR - Opcionales
            22,  // Rango de edad específico
            24,  // Apariencia física detallada  
            29,  // Referencias visuales
            
            // OFFERS - Opcionales
            31,  // Descripción de oferta detallada
            
            // AUDIENCIA - Opcionales
            35,  // Intereses y pain points (contexto adicional)
            
            // ESTÉTICA - Opcionales (toda la sección)
            36,  // Mood
            37,  // Lighting  
            38,  // Camera
            39,  // Pace
            
            // DISTRIBUCIÓN - Opcionales
            42,  // Ubicación principal
            
            // SCENARIOS - Opcionales  
            43,  // Ambiente/ambience
            
            // NOTAS - Opcionales
            44   // Preferencias del fundador
        ];
        this.uploadedFiles = {};
        this.isProcessingOnboarding = false; // Flag para prevenir múltiples procesamientos
        
        this.init();
    }

    // === PERSISTENCIA ELIMINADA ===
    // No se usa localStorage para evitar saltos de pasos
    
    // Función restoreStepData eliminada - no se necesita sin localStorage

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupAfterDOM());
        } else {
            this.setupAfterDOM();
        }
    }
    
    setupAfterDOM() {
        console.log('Setting up onboarding form...');
        this.bindEvents();
        this.bindInputEvents();
        this.bindOptionEvents();
        this.initializeFirstStep();
        this.initializeUploads();
        this.updateNavigationButtons();
        console.log('Onboarding form setup complete');
    }

    bindEvents() {
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');

        if (btnNext) btnNext.addEventListener('click', () => this.nextStep());
        if (btnBack) btnBack.addEventListener('click', () => this.prevStep());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !document.getElementById('btnNext').disabled) {
                e.preventDefault();
                this.nextStep();
            } else if (e.key === 'ArrowRight' && !document.getElementById('btnNext').disabled) {
                e.preventDefault();
                this.nextStep();
            } else if (e.key === 'ArrowLeft' && !document.getElementById('btnBack').disabled) {
                e.preventDefault();
                this.prevStep();
            }
        });
    }

    bindInputEvents() {
        // Text inputs
        const textInputs = ['nombre_marca', 'nombre_producto', 'sitio_web', 'instagram_url', 'tiktok_url', 
                           'palabras_usar', 'palabras_evitar', 'reglas_creativas',
                           'descripcion_producto', 'beneficio_1', 'beneficio_2', 'beneficio_3',
                           'diferenciacion', 'modo_uso', 'ingredientes', 'variantes_producto',
                           'apariencia_fisica', 'precio_producto', 'main_objective', 'offer_desc',
                           'cta', 'cta_url', 'buyer_persona', 'interests', 'pains', 'contexts',
                           'founder_prefs', 'restrictions'];

        textInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.updateFormData(id, e.target.value);
                    this.updateNavigationButtons();
                });
                
                input.addEventListener('blur', (e) => {
                    this.validateInputValue(input, e.target.value);
                });
            }
        });

        // Textarea inputs
        const textareaInputs = ['palabras_usar', 'palabras_evitar', 'reglas_creativas',
                               'descripcion_producto', 'diferenciacion', 'modo_uso', 
                               'ingredientes', 'variantes_producto', 'apariencia_fisica',
                               'main_objective', 'offer_desc', 'buyer_persona', 'interests', 'pains', 'contexts'];
        
        textareaInputs.forEach(id => {
            const textarea = document.getElementById(id);
            if (textarea) {
                textarea.addEventListener('input', (e) => {
                    this.updateFormData(id, e.target.value);
                    this.updateCharCounter(textarea);
                    this.updateNavigationButtons();
                });
            }
        });

        // Select inputs
        const selectInputs = ['moneda', 'acento_voz'];
        selectInputs.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.addEventListener('change', (e) => {
                    this.updateFormData(id, e.target.value);
                    this.updateNavigationButtons();
                });
            }
        });
    }

    bindOptionEvents() {
        // Single select options
        document.querySelectorAll('.option-card:not(.multi-select)').forEach(card => {
            card.addEventListener('click', () => this.selectOption(card));
        });

        // Multi select options
        document.querySelectorAll('.option-card.multi-select').forEach(card => {
            card.addEventListener('click', () => this.toggleMultiOption(card));
        });

        // Plan cards
        document.querySelectorAll('.plan-card').forEach(card => {
            card.addEventListener('click', () => this.selectOption(card));
        });

        // Creator cards
        document.querySelectorAll('.creator-card').forEach(card => {
            card.addEventListener('click', () => this.selectOption(card));
        });

        // Voice buttons
        document.querySelectorAll('.voice-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectVoiceOption(btn));
        });
    }

    selectOption(card) {
        const fieldName = this.getFieldNameForStep(this.currentStep);
        console.log(`🎯 selectOption - Step ${this.currentStep}, fieldName: "${fieldName}", value: "${card.dataset.value}"`);
        
        if (!fieldName) {
            console.log(`❌ No fieldName for step ${this.currentStep}`);
            return;
        }

        // Remove previous selection
        const container = card.closest('.options-grid, .creator-types, .voice-characteristics');
        if (container) {
            container.querySelectorAll('.option-card, .creator-card, .voice-btn').forEach(el => {
                el.classList.remove('selected');
            });
        }

        // Select current option
        card.classList.add('selected');
        const value = card.dataset.value;
        
        console.log(`✅ Added .selected class to card, value: "${value}"`);
        
        this.updateFormData(fieldName, value);
        this.updateNavigationButtons();
    }

    toggleMultiOption(card) {
        const fieldName = this.getFieldNameForStep(this.currentStep);
        if (!fieldName) return;

        card.classList.toggle('selected');
        const value = card.dataset.value;
        
        // Ensure the field is an array
        if (!Array.isArray(this.formData[fieldName])) {
            this.formData[fieldName] = [];
        }
        
        if (card.classList.contains('selected')) {
                if (!this.formData[fieldName].includes(value)) {
                    this.formData[fieldName].push(value);
                }
            } else {
                this.formData[fieldName] = this.formData[fieldName].filter(v => v !== value);
            }
        
        // Update hidden input
        this.updateHiddenInputs();
        this.updateNavigationButtons();
    }

    selectVoiceOption(btn) {
        const voiceType = btn.dataset.voice;
        const value = btn.dataset.value;
        
        if (!this.formData.caracteristicas_voz) {
            this.formData.caracteristicas_voz = {};
        }
        
        // Remove previous selection for this voice type
        const container = btn.closest('.voice-option');
        container.querySelectorAll('.voice-btn').forEach(b => b.classList.remove('selected'));
        
        // Select current option
        btn.classList.add('selected');
        this.formData.caracteristicas_voz[voiceType] = value;
        
        this.updateNavigationButtons();
    }

    updateFormData(fieldName, value) {
        if (fieldName && this.formData.hasOwnProperty(fieldName)) {
            this.formData[fieldName] = value;
            console.log(`📝 Updated ${fieldName}:`, value);
            console.log(`📋 Current formData:`, this.formData);
            
            // Actualizar botones de navegación después de actualizar datos
            this.updateNavigationButtons();
        } else {
            console.warn(`⚠️ Field ${fieldName} not found in formData`);
        }
    }

    updateCharCounter(textarea) {
        const counter = textarea.parentNode.querySelector('.char-counter');
        if (counter) {
            const maxLength = textarea.getAttribute('maxlength');
            const currentLength = textarea.value.length;
            counter.textContent = `${currentLength}/${maxLength}`;
        }
    }

    validateInputValue(input, value) {
        const trimmedValue = value.trim();
        
        if (input.required && !trimmedValue) {
            this.showInputError(input, 'Este campo es obligatorio');
            return false;
        }
        
        if (!input.required && !trimmedValue) {
            this.clearInputError(input);
            return true;
        }
        
        const minLength = this.getMinimumLength(input);
        if (trimmedValue.length < minLength) {
            this.showInputError(input, `Mínimo ${minLength} caracteres`);
            return false;
        }
        
        if (input.type === 'url' && trimmedValue && !this.isValidUrl(trimmedValue)) {
            this.showInputError(input, 'Formato de URL inválido');
            return false;
        }
        
        if (input.type === 'email' && trimmedValue && !this.isValidEmail(trimmedValue)) {
            this.showInputError(input, 'Formato de email inválido');
            return false;
        }
        
        this.clearInputError(input);
        return true;
    }

    showInputError(input, message) {
        input.classList.add('error');
        input.classList.remove('success');
        
        let errorElement = input.parentNode.querySelector('.input-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'input-error-message';
            input.parentNode.appendChild(errorElement);
        }
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    clearInputError(input) {
        input.classList.remove('error');
        input.classList.add('success');
        
        const errorElement = input.parentNode.querySelector('.input-error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    getMinimumLength(input) {
        const minLengths = {
            'nombre_marca': 2,
            'descripcion_producto': 10,
            'beneficio_1': 5,
            'beneficio_2': 5,
            'beneficio_3': 5,
            'diferenciacion': 10,
            'modo_uso': 10,
            'ingredientes': 5,
            'apariencia_fisica': 10,
            'main_objective': 10,
            'buyer_persona': 20,
            'interests': 5,
            'pains': 5,
            'contexts': 5
        };
        return minLengths[input.id] || 1;
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    getFieldNameForStep(step) {
        const fieldMap = {
            1: 'nombre_marca',
            2: null, // Social links - optional
            3: 'mercado_objetivo',
            4: 'idiomas_contenido',
            5: 'tono_voz',
            6: 'palabras_usar',
            7: 'palabras_evitar',
            8: 'reglas_creativas',
            9: 'logo_file',
            10: 'brand_files',
            11: 'tipo_producto',
            12: 'nombre_producto',
            13: 'descripcion_producto',
            14: 'beneficio_1',
            15: 'diferenciacion',
            16: 'modo_uso',
            17: 'ingredientes',
            18: 'precio_producto',
            19: 'variantes_producto',
            20: 'imagen_producto_1', // 4 Imágenes principales
            21: 'tipo_creador',
            22: 'rango_edad', 
            23: 'genero_avatar',
            24: 'apariencia_fisica',
            25: 'energia_avatar',
            26: 'idiomas_avatar',
            27: 'valores_avatar',
            28: 'caracteristicas_voz',
            29: 'avatar_imagen_ref',
            30: 'main_objective',
            31: 'offer_desc',
            32: 'cta',
            33: 'kpis',
            34: 'buyer_persona',
            35: 'interests',
            36: 'mood',
            37: 'lighting',
            38: 'camera',
            39: 'pace',
            40: 'platforms',
            41: 'formats',
            42: 'main_location',
            43: 'ambience',
            44: 'founder_prefs'
        };
        return fieldMap[step];
    }

    validateCurrentStep() {
        console.log('🔍 VALIDATING STEP:', this.currentStep, 'Total steps:', this.totalSteps);
        
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) {
            console.log('❌ No current slide found for step:', this.currentStep);
            return false;
        }

        // Verificar que el step esté dentro del rango válido
        if (this.currentStep < 1 || this.currentStep > this.totalSteps) {
            console.log('❌ Step fuera del rango válido:', this.currentStep, 'Rango válido: 1-' + this.totalSteps);
            return false;
        }

        let isValid = true;

        // Check required inputs
        const requiredInputs = currentSlide.querySelectorAll('input[required], textarea[required]');
        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                console.log(`❌ Required input empty:`, input.id, input.value);
                this.showInputError(input, 'Este campo es obligatorio');
                isValid = false;
            } else {
                console.log(`✅ Required input valid:`, input.id, input.value);
                this.clearInputError(input);
            }
        });

        // Check selected options (only for steps that have options)
        const hasOptions = currentSlide.querySelector('.option-card, .creator-card');
        
        if (hasOptions) {
            const selectedOption = currentSlide.querySelector('.option-card.selected, .creator-card.selected');
            const allCards = currentSlide.querySelectorAll('.option-card, .creator-card');
            
            console.log(`🔍 Step ${this.currentStep} option validation:`);
            console.log(`   - hasOptions: ${!!hasOptions}`);
            console.log(`   - selectedOption: ${!!selectedOption}`);
            console.log(`   - isOptional: ${this.optionalSteps.includes(this.currentStep)}`);
            console.log(`   - Total cards: ${allCards.length}`);
            
            allCards.forEach((card, i) => {
                console.log(`   - Card ${i}: value="${card.dataset.value}", selected=${card.classList.contains('selected')}`);
            });
            
            if (!selectedOption && !this.optionalSteps.includes(this.currentStep)) {
                console.log(`❌ No option selected for required step ${this.currentStep}`);
                isValid = false;
            }
        }

        // Step-specific validation
        switch (this.currentStep) {
            case 1: // Nombre de marca
                const nombreMarca = document.getElementById('nombre_marca');
                console.log('Validating step 1 - nombre_marca:', nombreMarca?.value);
                if (!nombreMarca) {
                    console.log('Step 1 validation failed - input not found');
                    isValid = false;
                } else if (!nombreMarca.value || nombreMarca.value.trim().length < 2) {
                    console.log('Step 1 validation failed - too short or empty');
                    this.showInputError(nombreMarca, 'Mínimo 2 caracteres');
                    isValid = false;
                } else {
                    console.log('Step 1 validation passed');
                    this.clearInputError(nombreMarca);
                }
                break;
                
            case 2: // Social links - optional
                isValid = true;
                break;
                
            case 3: // Mercado objetivo
                if (this.formData.mercado_objetivo.length === 0) {
                    isValid = false;
                }
                break;
                
            case 4: // Idiomas contenido
                if (this.formData.idiomas_contenido.length === 0) {
                    isValid = false;
                }
                break;
                
            case 5: // Tono de voz
                if (!this.formData.tono_voz) {
                    isValid = false;
                }
                break;
                
            case 6: // Palabras a usar
                const palabrasUsar = document.getElementById('palabras_usar');
                if (palabrasUsar && palabrasUsar.value.trim().length > 0 && palabrasUsar.value.trim().length < 5) {
                    this.showInputError(palabrasUsar, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 7: // Palabras a evitar - optional
                isValid = true;
                break;
                
            case 8: // Reglas creativas - optional
                isValid = true;
                break;
                
            case 9: // Logo file
                const logoFile = document.getElementById('logo_file');
                if (logoFile && !logoFile.files[0]) {
                    isValid = false;
                }
                break;
                
            case 10: // Brand files - optional
                    isValid = true;
                break;
                
            case 11: // Tipo de producto
                if (!this.formData.tipo_producto) {
                    isValid = false;
                }
                break;
                
            case 12: // Nombre producto
                const nombreProducto = document.getElementById('nombre_producto');
                console.log('Validating step 12 - nombre_producto:', nombreProducto?.value);
                if (nombreProducto && nombreProducto.value.trim().length < 2) {
                    console.log('Step 12 validation failed - too short');
                    this.showInputError(nombreProducto, 'Mínimo 2 caracteres');
                    isValid = false;
                } else {
                    console.log('Step 12 validation passed');
                    // Asegurar que el valor se guarde en formData
                    if (nombreProducto) {
                        this.formData.nombre_producto = nombreProducto.value.trim();
                        console.log('Step 12 - formData updated:', this.formData.nombre_producto);
                    }
                }
                break;
                
            case 13: // Descripción producto
                const descripcion = document.getElementById('descripcion_producto');
                if (descripcion && descripcion.value.trim().length < 10) {
                    this.showInputError(descripcion, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 14: // Beneficios - Solo el primero es obligatorio
                const beneficio1 = document.getElementById('beneficio_1');
                const beneficio2 = document.getElementById('beneficio_2');
                const beneficio3 = document.getElementById('beneficio_3');
                
                // OBLIGATORIO: Al menos el primer beneficio
                if (beneficio1 && beneficio1.value.trim().length < 5) {
                    this.showInputError(beneficio1, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                
                // OPCIONALES: Beneficios 2 y 3 - solo validar si no están vacíos
                if (beneficio2 && beneficio2.value.trim().length > 0 && beneficio2.value.trim().length < 5) {
                    this.showInputError(beneficio2, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                if (beneficio3 && beneficio3.value.trim().length > 0 && beneficio3.value.trim().length < 5) {
                    this.showInputError(beneficio3, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 15: // Diferenciación - optional
                isValid = true;
                break;
                
            case 16: // Modo de uso
                const modoUso = document.getElementById('modo_uso');
                if (modoUso && modoUso.value.trim().length > 0 && modoUso.value.trim().length < 10) {
                    this.showInputError(modoUso, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 17: // Ingredientes
                const ingredientes = document.getElementById('ingredientes');
                if (ingredientes && ingredientes.value.trim().length > 0 && ingredientes.value.trim().length < 5) {
                    this.showInputError(ingredientes, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 18: // Precio
                const precio = document.getElementById('precio_producto');
                if (precio && (!precio.value || parseFloat(precio.value) <= 0)) {
                    this.showInputError(precio, 'Precio debe ser mayor a 0');
                    isValid = false;
                }
                break;
                
            case 19: // Variantes - optional
                isValid = true;
                break;
                
            case 20: // Imágenes producto
                const imagen1 = document.getElementById('imagen_producto_1');
                const imagen2 = document.getElementById('imagen_producto_2');
                const hasImage1 = imagen1 && imagen1.files[0];
                const hasImage2 = imagen2 && imagen2.files[0];
                const hasFormDataImage1 = this.formData.imagen_producto_1;
                const hasFormDataImage2 = this.formData.imagen_producto_2;
                
                // Check if at least 2 images are provided (either from DOM or formData)
                const imageCount = [hasImage1, hasImage2, hasFormDataImage1, hasFormDataImage2].filter(Boolean).length;
                if (imageCount < 2) {
                    isValid = false;
                }
                break;
                
            case 21: // Tipo creador
                if (!this.formData.tipo_creador) {
                    isValid = false;
                }
                break;
                
            case 22: // Rango edad - optional
                isValid = true;
                break;
                
            case 23: // Género avatar
                if (!this.formData.genero_avatar) {
                    isValid = false;
                }
                break;
                
            case 24: // Apariencia física - optional
                isValid = true;
                break;
                
            case 25: // Energía avatar
                if (!this.formData.energia_avatar) {
                    isValid = false;
                }
                break;
                
            case 26: // Idiomas avatar
                if (this.formData.idiomas_avatar.length === 0) {
                    isValid = false;
                }
                break;
                
            case 27: // Valores avatar
                if (this.formData.valores_avatar.length === 0) {
                    isValid = false;
                }
                break;
                
            case 28: // Características voz
                if (!this.formData.caracteristicas_voz || Object.keys(this.formData.caracteristicas_voz).length === 0) {
                    isValid = false;
                }
                break;
                
            case 29: // Referencias - optional
                isValid = true;
                break;
                
            case 30: // Objetivo principal
                const mainObjective = document.getElementById('main_objective');
                if (mainObjective && mainObjective.value.trim().length < 10) {
                    this.showInputError(mainObjective, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 31: // Descripción de oferta - optional
                isValid = true;
                break;
                
            case 32: // Call to Action
                const cta = document.getElementById('cta');
                const ctaUrl = document.getElementById('cta_url');
                if (cta && cta.value.trim().length < 3) {
                    this.showInputError(cta, 'Mínimo 3 caracteres');
                    isValid = false;
                }
                if (ctaUrl && ctaUrl.value.trim() && !this.isValidUrl(ctaUrl.value.trim())) {
                    this.showInputError(ctaUrl, 'Formato de URL inválido');
                    isValid = false;
                }
                break;
                
            case 33: // KPIs
                if (this.formData.kpis.length === 0) {
                    isValid = false;
                }
                break;
                
            case 34: // Buyer persona
                const buyerPersona = document.getElementById('buyer_persona');
                if (buyerPersona && buyerPersona.value.trim().length < 20) {
                    this.showInputError(buyerPersona, 'Mínimo 20 caracteres');
                    isValid = false;
                }
                break;
                
            case 35: // Intereses y pain points
                const interests = document.getElementById('interests');
                const pains = document.getElementById('pains');
                const contexts = document.getElementById('contexts');
                
                if (interests && interests.value.trim().length > 0 && interests.value.trim().length < 5) {
                    this.showInputError(interests, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                if (pains && pains.value.trim().length > 0 && pains.value.trim().length < 5) {
                    this.showInputError(pains, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                if (contexts && contexts.value.trim().length > 0 && contexts.value.trim().length < 5) {
                    this.showInputError(contexts, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 36: // Mood - opcional
                isValid = true;
                break;
                
            case 37: // Lighting - opcional
                isValid = true;
                break;
                
            case 38: // Camera - opcional
                isValid = true;
                break;
                
            case 39: // Pace - opcional
                isValid = true;
                break;
                
            case 40: // Platforms
                if (this.formData.platforms.length === 0) {
                    isValid = false;
                }
                break;
                
            case 41: // Formats
                if (this.formData.formats.length === 0) {
                    isValid = false;
                }
                break;
                
            case 42: // Main location - opcional
                isValid = true;
                break;
                
            case 43: // Ambience - opcional
                isValid = true;
                break;
                
            case 44: // Founder prefs - opcional
                isValid = true;
                break;
                
            default:
                console.log(`⚠️ Step ${this.currentStep} - No validation case found`);
                isValid = true; // Para steps no definidos, permitir continuar
                break;
        }

        return isValid;
    }

    nextStep() {
        if (!this.validateCurrentStep()) {
            return;
        }

        this.collectStepData();
        
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.showStep(this.currentStep);
            this.updateProgress();
            this.updateNavigationButtons();
        } else {
            this.completeOnboarding();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            // Collect data from current step before going back
            this.collectStepData();
            
            this.currentStep--;
            this.showStep(this.currentStep);
            this.updateProgress();
            this.updateNavigationButtons();
        }
    }


    showStep(step) {
        // Hide all steps
        document.querySelectorAll('.question-slide').forEach(slide => {
            slide.classList.remove('active');
        });

        // Show current step
        const currentSlide = document.querySelector(`[data-step="${step}"]`);
        if (currentSlide) {
            currentSlide.classList.add('active');
        }

        // Update step counter
        const stepCounter = document.getElementById('currentStep');
        if (stepCounter) {
            stepCounter.textContent = step;
        }

        // No se restaura estado visual - inicio limpio
    }

    // Función restoreStepState eliminada - no se necesita sin localStorage

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            const progress = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${progress}%`;
        }
    }

    updateNavigationButtons() {
        console.log('🔄 UPDATE NAVIGATION BUTTONS - Current step:', this.currentStep);
        
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');

        // Verificar que el step actual esté dentro del rango válido
        if (this.currentStep < 1 || this.currentStep > this.totalSteps) {
            console.log(`❌ Step ${this.currentStep} fuera del rango válido (1-${this.totalSteps})`);
            if (btnNext) btnNext.disabled = true;
            if (btnBack) btnBack.disabled = this.currentStep === 1;
            return;
        }

        const isValid = this.validateCurrentStep();
        console.log(`🔄 Step ${this.currentStep} validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        if (btnNext) {
            btnNext.disabled = !isValid;
            console.log(`🎯 Button state: ${btnNext.disabled ? 'DISABLED' : 'ENABLED'}`);
        }

        if (btnBack) {
            btnBack.disabled = this.currentStep === 1;
        }
    }

    collectStepData() {
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) return;

        // Collect text inputs
        const textInputs = currentSlide.querySelectorAll('input[type="text"], input[type="url"], input[type="number"], textarea');
        textInputs.forEach(input => {
            if (input.id && this.formData.hasOwnProperty(input.id)) {
                this.formData[input.id] = input.value;
            }
        });

        // Collect select inputs
        const selectInputs = currentSlide.querySelectorAll('select');
        selectInputs.forEach(select => {
            if (select.id && this.formData.hasOwnProperty(select.id)) {
                this.formData[select.id] = select.value;
            }
        });

        // Collect file inputs (only if not already set by handleFileUpload)
        const fileInputs = currentSlide.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            if (input.id && this.formData.hasOwnProperty(input.id)) {
                // Only update if the formData field is null/empty
                if (!this.formData[input.id] || (Array.isArray(this.formData[input.id]) && this.formData[input.id].length === 0)) {
                    if (input.multiple) {
                        this.formData[input.id] = Array.from(input.files);
                    } else {
                        this.formData[input.id] = input.files[0] || null;
                    }
                }
            }
        });

        // Collect hidden inputs (for multi-select values)
        const hiddenInputs = currentSlide.querySelectorAll('input[type="hidden"]');
        hiddenInputs.forEach(input => {
            if (input.id && this.formData.hasOwnProperty(input.id)) {
                this.formData[input.id] = input.value;
            }
        });

        // Collect selected options (single select)
        const selectedOption = currentSlide.querySelector('.option-card.selected:not(.multi-select), .creator-card.selected');
        if (selectedOption) {
            const fieldName = this.getFieldNameForStep(this.currentStep);
            if (fieldName) {
                this.formData[fieldName] = selectedOption.dataset.value;
            }
        }

        // Collect multi-select options
        const selectedMultiOptions = currentSlide.querySelectorAll('.option-card.multi-select.selected');
        if (selectedMultiOptions.length > 0) {
            const fieldName = this.getFieldNameForStep(this.currentStep);
            if (fieldName && Array.isArray(this.formData[fieldName])) {
                this.formData[fieldName] = Array.from(selectedMultiOptions).map(option => option.dataset.value);
            }
        }

        // Update hidden inputs for multi-select fields
        this.updateHiddenInputs();
    }

    updateHiddenInputs() {
        // Update hidden inputs for multi-select fields
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) return;

        // Update mercado_objetivo hidden input
        const mercadoInput = currentSlide.querySelector('#mercado_objetivo');
        if (mercadoInput && Array.isArray(this.formData.mercado_objetivo)) {
            mercadoInput.value = this.formData.mercado_objetivo.join(',');
        }

        // Update idiomas_contenido hidden input
        const idiomasInput = currentSlide.querySelector('#idiomas_contenido');
        if (idiomasInput && Array.isArray(this.formData.idiomas_contenido)) {
            idiomasInput.value = this.formData.idiomas_contenido.join(',');
        }

        // Update idiomas_avatar hidden input
        const idiomasAvatarInput = currentSlide.querySelector('#idiomas_avatar');
        if (idiomasAvatarInput && Array.isArray(this.formData.idiomas_avatar)) {
            idiomasAvatarInput.value = this.formData.idiomas_avatar.join(',');
        }

        // Update valores_avatar hidden input
        const valoresInput = currentSlide.querySelector('#valores_avatar');
        if (valoresInput && Array.isArray(this.formData.valores_avatar)) {
            valoresInput.value = this.formData.valores_avatar.join(',');
        }

        // Update kpis hidden input
        const kpisInput = currentSlide.querySelector('#kpis');
        if (kpisInput && Array.isArray(this.formData.kpis)) {
            kpisInput.value = this.formData.kpis.join(',');
        }

        // Update caracteristicas_voz hidden input
        const vozInput = currentSlide.querySelector('#caracteristicas_voz');
        if (vozInput && this.formData.caracteristicas_voz) {
            vozInput.value = JSON.stringify(this.formData.caracteristicas_voz);
        }
    }

    async completeOnboarding(skipped = false) {
        // Protección contra múltiples ejecuciones
        if (this.isProcessingOnboarding) {
            console.log('⏳ Onboarding ya está siendo procesado...');
            return;
        }
        
        this.isProcessingOnboarding = true;
        
        try {
            console.log('Completando onboarding...');
            
            if (!skipped) {
                // Mostrar indicador de carga
                this.showLoadingState('Procesando datos...');
                
                // Recolectar todos los datos del formulario
                const formData = this.collectAllFormData();
                console.log('Datos recolectados:', formData);
                
                // Guardar datos localmente como respaldo
                this.saveOnboardingData();
                
                // Importar y usar las utilidades de Supabase
                const { processOnboardingData } = await import('./supabase-utils.js?v=2');
                
                // Procesar y enviar datos a Supabase
                const result = await processOnboardingData(formData);
                
                if (result.success) {
                    console.log('✅ Onboarding completado exitosamente. Project ID:', result.projectId);
                    this.hideLoadingState();
                    this.showSuccessPage();
                    
                    // Limpiar localStorage después del éxito
                    localStorage.clear();
                    console.log('🗑️ localStorage limpiado después del éxito');
                } else {
                    console.error('❌ Error procesando onboarding:', result.error);
                    this.hideLoadingState();
                    this.showError(`Error al completar la configuración: ${result.error}`);
                }
            } else {
                this.hideLoadingState();
                this.showSuccessPage();
            }
            
        } catch (error) {
            console.error('❌ Error completando onboarding:', error);
            this.hideLoadingState();
            this.showError('Error al completar la configuración. Por favor, inténtalo de nuevo.');
        } finally {
            // Resetear el flag después de 3 segundos
            setTimeout(() => {
                this.isProcessingOnboarding = false;
            }, 3000);
        }
    }

    collectAllFormData() {
        // Solo recolectar datos del step actual y los datos ya guardados
        this.collectStepData();
        
        // Return the collected form data
        console.log('📋 FormData completo recolectado:', this.formData);
        return this.formData;
    }

    saveOnboardingData() {
        // Save to localStorage for now (can be extended to save to server)
        try {
            localStorage.setItem('onboardingData', JSON.stringify(this.formData));
            localStorage.setItem('onboardingCompleted', 'true');
            localStorage.setItem('onboardingCompletedAt', new Date().toISOString());
            
            console.log('✅ Datos de onboarding guardados localmente');
        } catch (error) {
            console.error('❌ Error guardando datos:', error);
        }
    }

    showSuccessPage() {
        console.log('🎉 Mostrando pantalla de éxito...');
        
        // Hide current form slide
        document.querySelectorAll('.question-slide').forEach(slide => {
            slide.classList.remove('active');
        });
        
        // Hide navigation buttons
        const navButtons = document.querySelector('.navigation-buttons');
        if (navButtons) {
            navButtons.style.display = 'none';
        }
        
        // Show success screen
        const successSlide = document.querySelector('[data-step="success"]');
        if (successSlide) {
            successSlide.style.display = 'block';
            successSlide.classList.add('active');
            console.log('✅ Pantalla de éxito activada');
        } else {
            console.error('❌ No se encontró el slide de éxito');
        }
        
        // Update progress to 100%
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        
        // Add click handler for dashboard button
        const btnGoToDashboard = document.getElementById('btnGoToDashboard');
        if (btnGoToDashboard) {
            btnGoToDashboard.addEventListener('click', () => {
                console.log('🚀 Navegando al dashboard...');
                window.location.href = 'main-dashboard.html';
            });
        }
    }

    showError(message) {
        // Crear o mostrar modal de error
        let errorModal = document.getElementById('errorModal');
        if (!errorModal) {
            errorModal = document.createElement('div');
            errorModal.id = 'errorModal';
            errorModal.className = 'error-modal';
            errorModal.innerHTML = `
                <div class="error-content">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Error</h3>
                    <p id="errorMessage">${message}</p>
                    <button class="btn-primary" onclick="this.closest('.error-modal').remove()">
                        Entendido
                    </button>
                </div>
            `;
            document.body.appendChild(errorModal);
        } else {
            document.getElementById('errorMessage').textContent = message;
            errorModal.style.display = 'flex';
        }
    }

    showLoadingState(message) {
        // Create loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            color: white;
            font-size: 18px;
        `;
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="width: 40px; height: 40px; border: 4px solid #00d9ff; border-top: 4px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <div>${message}</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingOverlay);
    }

    hideLoadingState() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    initializeFirstStep() {
        console.log('🚀 INITIALIZING FIRST STEP');
        // Siempre iniciar desde el step 1
        this.currentStep = 1;
        console.log('📍 Step establecido a:', this.currentStep);
        
        this.showStep(this.currentStep);
        this.updateProgress();
        this.updateNavigationButtons();
    }

    initializeUploads() {
        // Initialize file upload functionality
        this.initializeFileUploads();
    }

    initializeFileUploads() {
        // Logo upload
        const logoUpload = document.getElementById('logoUpload');
        if (logoUpload) {
            this.setupFileUpload(logoUpload, 'logo_file');
        }

        // Brand files upload
        const brandFilesUpload = document.getElementById('brandFilesUpload');
        if (brandFilesUpload) {
            this.setupFileUpload(brandFilesUpload, 'brand_files', true);
        }

        // Product images upload
        for (let i = 1; i <= 4; i++) {
            const uploadSlot = document.querySelector(`[data-slot="${i}"]`);
            if (uploadSlot) {
                this.setupFileUpload(uploadSlot, `imagen_producto_${i}`);
            }
        }


        // Avatar reference uploads
        const avatarImageUpload = document.getElementById('avatarImageUpload');
        if (avatarImageUpload) {
            this.setupFileUpload(avatarImageUpload, 'avatar_imagen_ref');
        }

        const avatarVideoUpload = document.getElementById('avatarVideoUpload');
        if (avatarVideoUpload) {
            this.setupFileUpload(avatarVideoUpload, 'avatar_video_ref');
        }
    }

    setupFileUpload(uploadZone, fieldName, multiple = false) {
        const fileInput = uploadZone.querySelector('input[type="file"]');
        const placeholder = uploadZone.querySelector('.upload-placeholder');
        const preview = multiple ? 
            uploadZone.parentElement.querySelector('.uploaded-files') : 
            uploadZone.querySelector('.upload-preview');

        console.log(`🔧 Configurando subida de archivos para ${fieldName}:`, {
            uploadZone: !!uploadZone,
            fileInput: !!fileInput,
            placeholder: !!placeholder,
            preview: !!preview,
            multiple: multiple
        });

        if (!fileInput || !placeholder) {
            console.error(`❌ Elementos faltantes para ${fieldName}:`, {
                fileInput: !!fileInput,
                placeholder: !!placeholder,
                preview: !!preview
            });
            return;
        }
        
        // Para multiple upload, el preview es opcional ya que puede no existir inicialmente
        if (!multiple && !preview) {
            console.error(`❌ Preview faltante para upload único ${fieldName}`);
            return;
        }
        
        // Click to upload
            uploadZone.addEventListener('click', () => {
            fileInput.click();
            });
        
        // File selection
        fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
            
            if (files.length > 0) {
                this.handleFileUpload(files, fieldName, multiple, placeholder, preview);
            }
        });
        
        // Drag and drop
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
            uploadZone.classList.add('drag-over');
            });
            
            uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
            });
            
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
            uploadZone.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                this.handleFileUpload(files, fieldName, multiple, placeholder, preview);
            }
        });
    }

    handleFileUpload(files, fieldName, multiple, placeholder, preview) {
        console.log(`📁 Manejando subida de archivos para ${fieldName}:`, {
            files: files.length,
            multiple: multiple,
            fieldName: fieldName
        });

        if (multiple) {
            this.formData[fieldName] = files;
            this.showMultipleFilePreview(files, preview);
            placeholder.style.display = 'none';
            if (preview) preview.style.display = 'block';
        } else {
            this.formData[fieldName] = files[0];
            this.showSingleFilePreview(files[0], preview);
        placeholder.style.display = 'none';
        preview.style.display = 'block';
        }
        
        // Add remove functionality
        const removeButton = preview.querySelector('.remove-image, .remove-file');
        if (removeButton) {
            removeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(fieldName, placeholder, preview);
            });
        }
        
        this.updateNavigationButtons();
    }

    showSingleFilePreview(file, preview) {
            const img = preview.querySelector('img');
            const video = preview.querySelector('video');
            const fileName = preview.querySelector('.file-name');
            const fileSize = preview.querySelector('.file-size');
            
            if (file.type.startsWith('image/') && img) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/') && video) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    video.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
            
            // Only update file info if elements exist
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        }

    removeFile(fieldName, placeholder, preview) {
        // Clear form data
        this.formData[fieldName] = null;
        
        // Clear file input
        const fileInput = preview.parentNode.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset UI
        placeholder.style.display = 'block';
        preview.style.display = 'none';
        
        // Clear preview content
        const img = preview.querySelector('img');
        const video = preview.querySelector('video');
        if (img) img.src = '';
        if (video) video.src = '';
        
        this.updateNavigationButtons();
    }
        
    showMultipleFilePreview(files, preview) {
        if (!preview) {
            console.warn('Preview element not found for multiple file upload');
            return;
        }
        
        // El preview ya es el elemento .uploaded-files
        preview.innerHTML = '';
        preview.style.display = 'block';
            
            files.forEach(file => {
            const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
            fileItem.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${this.formatFileSize(file.size)}</span>
                <button type="button" class="remove-file">
                    <i class="fas fa-times"></i>
                </button>
            `;
            preview.appendChild(fileItem);
            });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.onboardingForm = new NewOnboardingForm();
});

// === FUNCIONES GLOBALES PARA DEBUGGING ===

// Función para limpiar todo y empezar de nuevo
window.resetOnboarding = function() {
    console.log('🔄 REINICIANDO ONBOARDING - Limpiando todo');
    
    // Limpiar localStorage completamente
    localStorage.clear();
    console.log('🗑️ localStorage completamente limpiado');
    
    if (window.onboardingForm) {
        // Forzar reinicio desde step 1
        window.onboardingForm.currentStep = 1;
        window.onboardingForm.showStep(1);
        window.onboardingForm.updateProgress();
        window.onboardingForm.updateNavigationButtons();
        console.log('🔄 Onboarding reiniciado desde step 1');
    } else {
        console.log('⚠️ Onboarding form no encontrado, recargando página...');
        location.reload();
    }
};

// Función para ver todos los datos guardados
window.showSavedData = function() {
    const savedData = localStorage.getItem('ugc_onboarding_data');
    
    console.log('📊 DATOS GUARDADOS:');
    console.log('📍 Paso actual:', window.onboardingForm?.currentStep);
    
    if (savedData) {
        const data = JSON.parse(savedData);
        console.log('📋 FormData completo:', data);
        
        // Mostrar solo campos que tienen datos
        const filledFields = Object.entries(data)
            .filter(([key, value]) => {
                if (Array.isArray(value)) return value.length > 0;
                if (typeof value === 'object') return Object.keys(value).length > 0;
                return value && value.toString().trim() !== '';
            });
            
        console.log(`✅ ${filledFields.length} campos con datos:`);
        filledFields.forEach(([key, value]) => {
            console.log(`   ${key}:`, value);
        });
    } else {
        console.log('❌ No hay datos guardados');
    }
};

// Función para ir a un step específico (para debugging) - DESHABILITADA
window.goToStep = function(step) {
    console.warn('⚠️ Función goToStep deshabilitada para evitar saltos de pasos');
    console.log('📍 Step actual:', window.onboardingForm?.currentStep);
};

// Función para llenar datos de prueba rápidamente
window.fillTestData = function() {
    if (!window.onboardingForm) return;
    
    const testData = {
        nombre_marca: 'Mi Marca Test',
        sitio_web: 'https://test.com',
        mercado_objetivo: ['colombia'],
        idiomas_contenido: ['es'],
        tono_voz: 'amigable',
        palabras_usar: 'natural, orgánico, saludable',
        tipo_producto: 'cosmetico',
        nombre_producto: 'Crema Hidratante Test',
        descripcion_producto: 'Una crema hidratante natural que nutre la piel diariamente.',
        beneficio_1: 'Hidratación profunda',
        precio_producto: '25.99',
        tipo_creador: 'creador_humano',
        genero_avatar: 'femenino',
        energia_avatar: 'calmado',
        idiomas_avatar: ['es'],
        valores_avatar: ['naturalidad'],
        caracteristicas_voz: {timbre: 'medio', acento: 'neutro'},
        main_objective: 'Aumentar awareness de la marca y generar confianza',
        cta: 'Compra ahora',
        kpis: ['engagement'],
        buyer_persona: 'Mujer de 25-35 años, interesada en productos naturales, activa en redes sociales',
        platforms: ['instagram'],
        formats: ['1:1']
    };
    
    Object.assign(window.onboardingForm.formData, testData);
    window.onboardingForm.saveToLocalStorage();
    
    console.log('🚀 Datos de prueba cargados! Usa goToStep() para navegar o refresca la página');
};

console.log(`
🎮 COMANDOS DE DEBUGGING DISPONIBLES:
• showSavedData()         - Ver todos los datos guardados
• resetOnboarding()       - Limpiar todo y empezar de nuevo  
• debugStep45()           - Investigar problema del step 45
• checkVersion()          - Verificar versión cargada
• checkAuthStatus()       - Verificar estado de autenticación
• refreshAuth()           - Refrescar sesión de autenticación
• checkBucketStatus()     - Verificar estado del bucket
• applyFilesTablePolicies() - Aplicar políticas RLS de tabla files ⭐
• testFilesInsert()       - Probar inserción en tabla files
• verifyFilesTable()      - Verificar estructura de tabla files
• testImageUpload()       - Probar subida de imágenes
• fillTestData()          - Llenar datos de prueba rápidamente

⚠️ NOTA: Los buckets se configuran desde el Dashboard de Supabase
`);

// Función para verificar la versión
window.checkVersion = () => {
    console.log('🔍 VERIFICANDO VERSIÓN:');
    console.log('✅ VERSIÓN 2 CARGADA - Sin localStorage');
    console.log('📍 Step actual:', window.onboardingForm?.currentStep);
    console.log('📊 Total steps:', window.onboardingForm?.totalSteps);
    console.log('🗄️ localStorage vacío:', Object.keys(localStorage).length === 0);
};

// Global debugging functions
window.debugOnboarding = () => {
    console.log('Current Step:', window.onboardingForm.currentStep);
    console.log('Form Data:', window.onboardingForm.formData);
    console.log('Validation:', window.onboardingForm.validateCurrentStep());
};

window.debugContinueButton = () => {
    const btnNext = document.getElementById('btnNext');
    const currentSlide = document.querySelector(`[data-step="${window.onboardingForm.currentStep}"]`);
    const nombreMarca = document.getElementById('nombre_marca');
    
    console.log('=== DEBUG CONTINUE BUTTON ===');
    console.log('Button exists:', !!btnNext);
    console.log('Button disabled:', btnNext?.disabled);
    console.log('Current step:', window.onboardingForm.currentStep);
    console.log('Current slide exists:', !!currentSlide);
    console.log('Nombre marca input exists:', !!nombreMarca);
    console.log('Nombre marca value:', nombreMarca?.value);
    console.log('Nombre marca length:', nombreMarca?.value?.length);
    console.log('Validation result:', window.onboardingForm.validateCurrentStep());
    console.log('Form data nombre_marca:', window.onboardingForm.formData.nombre_marca);
    console.log('=============================');
};

window.testValidation = () => {
    console.log('=== TEST VALIDATION ===');
    const result = window.onboardingForm.validateCurrentStep();
    console.log('Validation result:', result);
    console.log('=======================');
    return result;
};

window.forceCompleteOnboarding = () => {
    window.onboardingForm.completeOnboarding();
};

// Función para investigar el problema del step 45
window.debugStep45 = () => {
    console.log('🔍 DEBUGGING STEP 45 ISSUE');
    console.log('Current step:', window.onboardingForm?.currentStep);
    console.log('Total steps:', window.onboardingForm?.totalSteps);
    console.log('Form data keys:', Object.keys(window.onboardingForm?.formData || {}));
    
    // Verificar si hay algún slide con data-step="45"
    const slide45 = document.querySelector('[data-step="45"]');
    console.log('Slide 45 exists:', !!slide45);
    
    // Verificar todos los slides disponibles
    const allSlides = document.querySelectorAll('.question-slide');
    console.log('Total slides found:', allSlides.length);
    allSlides.forEach(slide => {
        const step = slide.getAttribute('data-step');
        console.log('Slide step:', step, 'Active:', slide.classList.contains('active'));
    });
    
    // Verificar si hay algún valor en localStorage que cause el problema
    const savedData = localStorage.getItem('ugc_onboarding_data');
    const savedStep = localStorage.getItem('ugc_onboarding_step');
    console.log('Saved data exists:', !!savedData);
    console.log('Saved step:', savedStep);
    
    if (savedData) {
        const data = JSON.parse(savedData);
        console.log('Saved data keys:', Object.keys(data));
    }
};
