// New Onboarding JavaScript - Complete UGC Setup

class NewOnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 29;
        this.formData = {
            // Sección 1: Perfil de usuario
            
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
            timbre_voz: '',
            velocidad_voz: '',
            acento_voz: '',
            avatar_imagen_ref: null,
            avatar_video_ref: null
        };
        this.uploadedFiles = new Map();
        this.isTransitioning = false;
        
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupAfterDOM());
        } else {
            this.setupAfterDOM();
        }
    }
    
    setupAfterDOM() {
        this.bindEvents();
        this.updateProgress();
        this.updateNavigationButtons();
        this.initializeFirstStep();
        this.initializeUploads();
    }

    // ===================================
    // NAVIGATION FUNCTIONS
    // ===================================


    prevStep() {
        if (this.isTransitioning || this.currentStep <= 1) return;
        
        this.currentStep--;
        this.showStep(this.currentStep);
        this.updateProgress();
    }

    skipToEnd() {
        this.saveDataAndRedirect(true);
    }


    bindEvents() {
        // Navigation buttons
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        const btnSkip = document.getElementById('btnSkip');

        if (btnNext) btnNext.addEventListener('click', () => this.nextStep());
        if (btnBack) btnBack.addEventListener('click', () => this.prevStep());
        if (btnSkip) btnSkip.addEventListener('click', () => this.skipToEnd());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isTransitioning) return;
            
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

        // Form inputs
        this.bindInputEvents();
        this.bindOptionEvents();
    }

    bindInputEvents() {
        // Text inputs
        const textInputs = [
            'nombre_marca', 'sitio_web', 'instagram_url', 'tiktok_url',
            'tono_voz', 'palabras_usar', 'palabras_evitar', 'reglas_creativas',
            'tipo_producto', 'descripcion_producto', 'beneficio_1', 'beneficio_2', 'beneficio_3',
            'diferenciacion', 'modo_uso', 'ingredientes', 'precio_producto', 'variantes_producto',
            'rango_edad', 'apariencia_fisica', 'energia_avatar', 'valores_avatar'
        ];

        textInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    const value = e.target.value;
                    
                    // Validar antes de actualizar formData
                    const isValid = this.validateInputValue(input, value);
                    
                    if (isValid) {
                        // Solo actualizar formData si la validación pasa
                        this.formData[id] = value;
                        this.clearInputError(input);
                        console.log(`✅ Input ${id} válido: "${value}"`);
                    } else {
                        // Mostrar error visual pero no actualizar formData
                        this.showInputError(input, this.getInputErrorMessage(input, value));
                        console.log(`❌ Input ${id} inválido: "${value}"`);
                    }
                    
                    // Actualizar botones de navegación
                    this.updateNavigationButtons();
                });

                // Agregar evento de blur para validación adicional
                input.addEventListener('blur', (e) => {
                    const value = e.target.value.trim();
                    if (value && !this.validateInputValue(e.target, value)) {
                        this.showInputError(e.target, this.getInputErrorMessage(e.target, value));
                    }
                });

                // Agregar evento de focus para limpiar errores
                input.addEventListener('focus', (e) => {
                    this.clearInputError(e.target);
                });
            }
        });
    }

    validateInputValue(input, value) {
        const trimmedValue = value.trim();
        
        // Si el campo es requerido y está vacío, es inválido
        if (input.required && !trimmedValue) {
            return false;
        }
        
        // Si el campo no es requerido y está vacío, es válido
        if (!input.required && !trimmedValue) {
            return true;
        }
        
        // Validar longitud mínima
        const minLength = this.getMinimumLength(input);
        if (trimmedValue.length < minLength) {
            return false;
        }
        
        // Validaciones específicas por tipo
        if (input.type === 'url' && trimmedValue) {
            return this.isValidUrl(trimmedValue);
        }
        
        if (input.type === 'number' && trimmedValue) {
            return !isNaN(parseFloat(trimmedValue)) && parseFloat(trimmedValue) > 0;
        }
        
        if (input.type === 'email' && trimmedValue) {
            return this.isValidEmail(trimmedValue);
        }
        
        return true;
    }

    getInputErrorMessage(input, value) {
        const trimmedValue = value.trim();
        
        if (input.required && !trimmedValue) {
            return 'Este campo es obligatorio';
        }
        
        const minLength = this.getMinimumLength(input);
        if (trimmedValue.length < minLength) {
            return `Mínimo ${minLength} caracteres requeridos`;
        }
        
        if (input.type === 'url' && trimmedValue && !this.isValidUrl(trimmedValue)) {
            return 'Ingresa una URL válida (ej: https://ejemplo.com)';
        }
        
        if (input.type === 'number' && trimmedValue && (isNaN(parseFloat(trimmedValue)) || parseFloat(trimmedValue) <= 0)) {
            return 'Ingresa un número válido mayor a 0';
        }
        
        if (input.type === 'email' && trimmedValue && !this.isValidEmail(trimmedValue)) {
            return 'Ingresa un email válido';
        }
        
        return 'Valor inválido';
    }

    showInputError(input, message) {
        // Remover clases de éxito previas
        input.classList.remove('success');
        
        // Agregar clase de error
        input.classList.add('error');
        
        // Crear o actualizar mensaje de error
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
        // Remover clase de error
        input.classList.remove('error');
        
        // Agregar clase de éxito si tiene valor válido
        if (input.value.trim()) {
            input.classList.add('success');
        }
        
        // Ocultar mensaje de error
        const errorElement = input.parentNode.querySelector('.input-error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    getMinimumLength(input) {
        // Longitudes mínimas específicas por tipo de input
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
            'valores_avatar': 5,
            'buyer_persona': 20,
            'avatar_traits': 10
        };
        
        return minLengths[input.id] || 1;
    }

    bindOptionEvents() {
        // Single-select option cards
        document.querySelectorAll('.option-card:not(.multi-select)').forEach(card => {
            card.addEventListener('click', () => {
                this.selectOption(card);
            });
        });

        // Multi-select option cards
        document.querySelectorAll('.option-card.multi-select').forEach(card => {
            card.addEventListener('click', () => {
                this.toggleMultiOption(card);
            });
        });

        // Plan cards
        document.querySelectorAll('.plan-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectOption(card);
            });
        });

        // Creator cards
        document.querySelectorAll('.creator-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectOption(card);
            });
        });

        // Voice buttons
        document.querySelectorAll('.voice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectVoiceOption(btn);
            });
        });
    }

    selectOption(element) {
        const questionSlide = element.closest('.question-slide');
        const step = parseInt(questionSlide.dataset.step);
        const value = element.dataset.value;

        // Remove selection from siblings
        const siblings = element.parentNode.children;
        Array.from(siblings).forEach(sibling => {
            sibling.classList.remove('selected');
        });

        // Add selection to clicked element
        element.classList.add('selected');

        // Store data
        const fieldName = this.getFieldNameForStep(step);
        if (fieldName) {
            this.formData[fieldName] = value;
        }

        // Add ripple effect
        this.addRipple(element);

        // Auto-advance after short delay
        setTimeout(() => {
            if (step < this.totalSteps) {
                this.nextStep();
            }
        }, 600);
    }

    toggleMultiOption(element) {
        element.classList.toggle('selected');
        
        const questionSlide = element.closest('.question-slide');
        const step = parseInt(questionSlide.dataset.step);
        const value = element.dataset.value;
        
        const fieldName = this.getFieldNameForStep(step);
        
        if (fieldName && Array.isArray(this.formData[fieldName])) {
            if (element.classList.contains('selected')) {
                if (!this.formData[fieldName].includes(value)) {
                    this.formData[fieldName].push(value);
                }
            } else {
                this.formData[fieldName] = this.formData[fieldName].filter(v => v !== value);
            }
        }

        this.validateCurrentStep();
    }

    selectVoiceOption(button) {
        const voiceType = button.dataset.voice;
        const value = button.dataset.value;
        
        // Remove selection from siblings of same type
        document.querySelectorAll(`[data-voice="${voiceType}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Add selection to clicked button
        button.classList.add('selected');
        
        // Store data
        this.formData[`${voiceType}_voz`] = value;
        this.updateVoiceCharacteristics();
        this.validateCurrentStep();
    }

    updateVoiceCharacteristics() {
        const caracteristicas = {
            timbre: this.formData.timbre_voz || '',
            velocidad: this.formData.velocidad_voz || '',
            acento: this.formData.acento_voz || ''
        };
        
        this.formData.caracteristicas_voz = JSON.stringify(caracteristicas);
    }

    getCurrentSection() {
        const currentSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);
        return currentSlide ? currentSlide.getAttribute('data-section') : 'unknown';
    }

    getStepData(step) {
        // Obtener datos específicos del paso actual
        const fieldName = this.getFieldNameForStep(step);
        const stepData = {
            step: step,
            fieldName: fieldName,
            value: null,
            type: 'unknown'
        };

        if (fieldName && this.formData.hasOwnProperty(fieldName)) {
            stepData.value = this.formData[fieldName];
            stepData.type = 'form_field';
        } else {
            // Para pasos sin campo específico (como uploads, selección múltiple, etc.)
            const currentSlide = document.querySelector(`.question-slide[data-step="${step}"]`);
            if (currentSlide) {
                // Verificar si hay opciones seleccionadas
                const selected = currentSlide.querySelectorAll('.option-card.selected, .multi-select.selected');
                if (selected.length > 0) {
                    stepData.value = Array.from(selected).map(el => el.getAttribute('data-value'));
                    stepData.type = 'option_selection';
                }
                
                // Verificar si hay archivos subidos
                const fileInput = currentSlide.querySelector('input[type="file"]');
                if (fileInput && fileInput.files.length > 0) {
                    stepData.value = Array.from(fileInput.files).map(f => f.name);
                    stepData.type = 'file_upload';
                }
                
                // Verificar inputs de texto dentro del paso
                const textInputs = currentSlide.querySelectorAll('input[type="text"], textarea, input[type="email"], input[type="number"]');
                if (textInputs.length > 0) {
                    const inputData = {};
                    textInputs.forEach(input => {
                        if (input.id) {
                            inputData[input.id] = input.value;
                        }
                    });
                    if (Object.keys(inputData).length > 0) {
                        stepData.value = inputData;
                        stepData.type = 'text_inputs';
                    }
                }
            }
        }

        return stepData;
    }

    validateField(fieldName, value) {
        // Validar campos específicos según su tipo
        if (!fieldName || value === undefined || value === null) {
            return false;
        }

        const trimmedValue = typeof value === 'string' ? value.trim() : value;

        switch (fieldName) {
            case 'pais_usuario':
                return trimmedValue.length >= 2;
            
            case 'idioma_preferido':
                return trimmedValue.length >= 2;
            
            case 'nombre_marca':
                return trimmedValue.length >= 2;
            
            case 'sitio_web':
                // URL optional - puede estar vacío o ser una URL válida
                if (trimmedValue === '') return true;
                try {
                    new URL(trimmedValue);
                    return true;
                } catch {
                    // Si no es URL válida, verificar si es un dominio simple
                    return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(trimmedValue);
                }
            
            case 'instagram_url':
            case 'tiktok_url':
                // Redes sociales opcionales
                if (trimmedValue === '') return true;
                return trimmedValue.length >= 3;
            
            case 'palabras_usar':
            case 'palabras_evitar':
                return trimmedValue.length >= 3;
            
            case 'reglas_creativas':
                return trimmedValue.length >= 10;
            
            case 'descripcion_producto':
                return trimmedValue.length >= 20;
            
            case 'beneficio_1':
            case 'beneficio_2':
            case 'beneficio_3':
                return trimmedValue.length >= 3;
            
            case 'diferenciacion':
            case 'modo_uso':
            case 'ingredientes':
                return trimmedValue.length >= 5;
            
            case 'precio_producto':
                const precio = parseFloat(trimmedValue);
                return !isNaN(precio) && precio > 0;
            
            case 'variantes_producto':
                return trimmedValue.length >= 3;
            
            case 'apariencia_fisica':
                return trimmedValue.length >= 10;
            
            default:
                // Para campos no específicos, validación básica
                return trimmedValue.length > 0;
        }
    }

    getFieldNameForStep(step) {
        const stepMapping = {
            1: 'pais_usuario',
            2: 'idioma_preferido',
            3: 'nombre_marca',
            4: null, // Social links handled separately
            5: 'mercado_objetivo',
            6: 'idiomas_contenido',
            7: 'tono_voz',
            8: 'palabras_usar',
            9: 'palabras_evitar',
            10: 'reglas_creativas',
            11: null, // Logo upload
            12: null, // Brand files upload
            13: 'tipo_producto',
            14: 'descripcion_producto',
            15: null, // Benefits handled separately
            16: 'diferenciacion',
            17: 'modo_uso',
            18: 'ingredientes',
            19: 'precio_producto',
            20: 'variantes_producto',
            21: null, // Main product image
            22: null, // Product gallery
            23: 'tipo_creador',
            24: 'rango_edad',
            25: 'genero_avatar',
            26: 'apariencia_fisica',
            27: 'energia_avatar',
            28: 'idiomas_avatar',
            29: 'valores_avatar',
            30: null, // Voice characteristics handled separately
            31: null  // Avatar references
        };
        
        return stepMapping[step];
    }

    validateCurrentStep() {
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) return false;

        // Check for required text inputs
        const textInputs = currentSlide.querySelectorAll('input[type="text"], textarea');
        for (let input of textInputs) {
            if (input.required && !input.value.trim()) {
                return false;
            }
        }

        // Check for selected options
        const optionCards = currentSlide.querySelectorAll('.option-card');
        if (optionCards.length > 0) {
            const hasSelection = currentSlide.querySelector('.option-card.selected');
            if (!hasSelection) return false;
        }

        return true;
    }

    updateNextButton(isValid = null) {
        const btnNext = document.getElementById('btnNext');
        
        if (isValid === null) {
            isValid = this.validateCurrentStep();
        }
        
        if (btnNext) {
            btnNext.disabled = !isValid;
            if (this.currentStep === this.totalSteps) {
                btnNext.innerHTML = `
                    <i class="fas fa-check"></i>
                    Finalizar
                `;
            } else {
                btnNext.innerHTML = `
                    Continuar
                    <i class="fas fa-arrow-right"></i>
                `;
            }
        }
    }

    nextStep() {
        console.log(`🚀 nextStep() llamado desde paso ${this.currentStep}`);
        
        if (this.isTransitioning) {
            console.log('⏸️ Transición en progreso - saltando');
            return;
        }
        
        if (!this.validateCurrentStep()) {
            console.log('❌ Validación del paso actual falló');
            return;
        }

        if (this.currentStep >= this.totalSteps) {
            console.log('🏁 Último paso alcanzado - completando onboarding');
            this.completeOnboarding();
            return;
        }

        // Disparar evento de completar step
        document.dispatchEvent(new CustomEvent('onboarding:step_complete', {
            detail: {
                step: this.currentStep,
                section: this.getCurrentSection(),
                data: this.getStepData(this.currentStep)
            }
        }));

        this.isTransitioning = true;
        this.currentStep++;
        this.transitionToStep('next');
    }

    async completeOnboarding() {
        try {
            console.log('🏁 Finalizando onboarding...');
            
            // 1. Recopilar todos los datos finales
            this.collectAllFormData();
            
            // 2. Verificar que el usuario esté autenticado
            const currentUser = await window.supabaseClient.getCurrentUser();
            if (!currentUser) {
                console.error('❌ Usuario no autenticado para completar onboarding');
                alert('Error: Sesión expirada. Por favor, inicia sesión nuevamente.');
                window.location.href = '/login.html';
                return;
            }
            
            // 3. Guardar todos los datos en Supabase con el ID del usuario
            console.log('💾 Guardando datos completos en Supabase...');
            console.log('📊 Datos del usuario:', currentUser.id);
            console.log('📋 Datos del formulario:', this.formData);
            
            await this.saveAllDataToSupabase(currentUser.id);
            
            // 4. Mostrar pantalla de éxito
            this.showSuccessPage();
            
            // 5. Redirigir al dashboard después de 3 segundos
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 3000);
            
        } catch (error) {
            console.error('❌ Error completando onboarding:', error);
            alert('Error al guardar los datos. Por favor, intenta nuevamente.');
        }
    }

    collectAllFormData() {
        // Recopilar todos los datos del formulario antes del envío
        console.log('📝 Recopilando datos finales del formulario...');
        
        // Asegurar que todos los campos estén actualizados
        document.querySelectorAll('input, textarea, select').forEach(input => {
            if (input.id && this.formData.hasOwnProperty(input.id)) {
                if (input.type === 'checkbox') {
                    this.formData[input.id] = input.checked;
                } else if (input.type === 'radio') {
                    if (input.checked) {
                        this.formData[input.id] = input.value;
                    }
                } else {
                    this.formData[input.id] = input.value || '';
                }
            }
        });
        
        // Recopilar opciones seleccionadas
        document.querySelectorAll('.option-card.selected, .multi-select.selected').forEach(selected => {
            const stepSlide = selected.closest('.question-slide');
            const step = parseInt(stepSlide?.getAttribute('data-step'));
            const fieldName = this.getFieldNameForStep(step);
            
            if (fieldName) {
                const value = selected.getAttribute('data-value');
                if (selected.classList.contains('multi-select')) {
                    // Para selección múltiple
                    if (!Array.isArray(this.formData[fieldName])) {
                        this.formData[fieldName] = [];
                    }
                    if (!this.formData[fieldName].includes(value)) {
                        this.formData[fieldName].push(value);
                    }
                } else {
                    // Para selección única
                    this.formData[fieldName] = value;
                }
            }
        });
        
        console.log('✅ Datos finales recopilados:', this.formData);
    }

    async saveAllDataToSupabase(userId) {
        try {
            console.log('💾 Iniciando guardado en Supabase con userId:', userId);
            
            if (!window.supabaseClient || !window.supabaseClient.isReady()) {
                throw new Error('Supabase client no está disponible');
            }

            // 1. Guardar marca/proyecto
            const proyecto = {
                nombre: this.formData.nombre_marca || 'Mi Proyecto',
                sitio_web: this.formData.sitio_web || '',
                redes_sociales: {
                    instagram: this.formData.instagram_url || '',
                    tiktok: this.formData.tiktok_url || ''
                },
                mercado_objetivo: this.formData.mercado_objetivo || [],
                idiomas_contenido: this.formData.idiomas_contenido || [],
                tono_voz: this.formData.tono_voz || '',
                guias_de_marca: {
                    palabras_usar: this.formData.palabras_usar || '',
                    palabras_evitar: this.formData.palabras_evitar || '',
                    reglas_creativas: this.formData.reglas_creativas || ''
                }
            };

            const savedProject = await window.supabaseClient.saveProject(userId, proyecto);
            console.log('✅ Proyecto guardado:', savedProject);

            // 2. Guardar producto
            const producto = {
                nombre: this.formData.nombre_marca || 'Mi Producto',
                proyecto_id: savedProject.id,
                tipo: this.formData.tipo_producto || 'fisico',
                descripcion: this.formData.descripcion_producto || '',
                beneficios: [
                    this.formData.beneficio_1 || '',
                    this.formData.beneficio_2 || '',
                    this.formData.beneficio_3 || ''
                ].filter(b => b),
                diferenciacion: this.formData.diferenciacion || '',
                modo_uso: this.formData.modo_uso || '',
                ingredientes: this.formData.ingredientes || '',
                precio: parseFloat(this.formData.precio_producto) || 0,
                variantes: this.formData.variantes_producto || ''
            };

            const savedProduct = await window.supabaseClient.saveProduct(userId, producto);
            console.log('✅ Producto guardado:', savedProduct);

            // 3. Guardar avatar
            const avatar = {
                nombre: `Avatar ${this.formData.tipo_creador || 'Principal'}`,
                marca_id: savedProject.id,
                tipo: this.formData.tipo_creador || 'lifestyle',
                demografia: {
                    rango_edad: this.formData.rango_edad || '25-35',
                    genero: this.formData.genero_avatar || 'neutro'
                },
                personalidad: {
                    energia: this.formData.energia_avatar || 'equilibrada',
                    valores: this.formData.valores_avatar || [],
                    apariencia: this.formData.apariencia_fisica || ''
                },
                idiomas: this.formData.idiomas_avatar || ['español'],
                voice_settings: {
                    timbre: this.formData.timbre_voz || 'natural',
                    velocidad: this.formData.velocidad_voz || 'normal',
                    acento: this.formData.acento_voz || 'neutro'
                }
            };

            const savedAvatar = await window.supabaseClient.saveAvatar(userId, avatar);
            console.log('✅ Avatar guardado:', savedAvatar);

            // 4. Actualizar perfil del usuario con datos de onboarding
            const userProfile = {
                pais: this.formData.pais_usuario || '',
                idioma_preferido: this.formData.idioma_preferido || 'español',
                onboarding_completed: true,
                onboarding_completed_at: new Date().toISOString(),
                plan: 'pro' // Plan por defecto
            };

            await window.supabaseClient.updateUserProfile(userId, userProfile);
            console.log('✅ Perfil de usuario actualizado');

            // 5. Registrar evento de onboarding completado
            try {
                if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                    window.analyticsEngine.track('onboarding_completed', {
                        user_id: userId,
                        steps_completed: this.totalSteps,
                        brand_name: this.formData.nombre_marca,
                        product_type: this.formData.tipo_producto,
                        avatar_type: this.formData.tipo_creador,
                        completion_time: Date.now() - this.startTime
                    });
                }
            } catch (error) {
                console.warn('⚠️ Error en analytics tracking (onboarding_completed):', error);
            }

            console.log('✅ Todos los datos guardados exitosamente en Supabase');
            return {
                project: savedProject,
                product: savedProduct,
                avatar: savedAvatar,
                userId: userId
            };
            
        } catch (error) {
            console.error('❌ Error guardando en Supabase:', error);
            throw error;
        }
    }

    showSuccessPage() {
        // Ocultar formulario actual
        document.querySelectorAll('.question-slide').forEach(slide => {
            slide.style.display = 'none';
        });
        
        // Mostrar pantalla de éxito
        const successSlide = document.querySelector('.question-slide[data-step="success"]');
        if (successSlide) {
            successSlide.style.display = 'block';
            successSlide.classList.add('active');
        }
        
        // Actualizar barra de progreso a 100%
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        
        // Actualizar contador de pasos
        const currentStepSpan = document.getElementById('currentStep');
        if (currentStepSpan) {
            currentStepSpan.textContent = '31';
        }
        
        console.log('🎉 Pantalla de éxito mostrada');
    }

    prevStep() {
        if (this.isTransitioning || this.currentStep <= 1) return;

        this.isTransitioning = true;
        this.currentStep--;
        this.transitionToStep('prev');
    }

    transitionToStep(direction = 'next') {
        const currentSlide = document.querySelector('.question-slide.active');
        const nextSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);

        if (!nextSlide) {
            this.isTransitioning = false;
            return;
        }

        // Animate out current slide
        if (currentSlide) {
            currentSlide.style.transform = direction === 'next' ? 'translateX(-50px)' : 'translateX(50px)';
            currentSlide.style.opacity = '0';
        }

        setTimeout(() => {
            // Hide current slide
            if (currentSlide) {
                currentSlide.classList.remove('active');
                currentSlide.style.transform = '';
                currentSlide.style.opacity = '';
            }

            // Show next slide
            nextSlide.classList.add('active');
            nextSlide.style.transform = direction === 'next' ? 'translateX(30px)' : 'translateX(-30px)';
            nextSlide.style.opacity = '0';

            // Animate in next slide
            setTimeout(() => {
                nextSlide.style.transform = '';
                nextSlide.style.opacity = '';
                this.isTransitioning = false;
                
                // Disparar evento de inicio de step
                document.dispatchEvent(new CustomEvent('onboarding:step_start', {
                    detail: {
                        step: this.currentStep,
                        section: this.getCurrentSection()
                    }
                }));
                
                // Focus first input if available
                const firstInput = nextSlide.querySelector('input[type="text"], textarea');
                if (firstInput && !firstInput.hidden) {
                    firstInput.focus();
                }
                
                this.updateProgress();
                this.updateNavigationButtons();
                this.validateCurrentStep();
            }, 50);
        }, 200);
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const currentStepSpan = document.getElementById('currentStep');
        
        if (progressFill) {
            const percentage = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${percentage}%`;
        }
        
        if (currentStepSpan) {
            currentStepSpan.textContent = this.currentStep;
        }
    }

    updateNavigationButtons() {
        const btnBack = document.getElementById('btnBack');
        
        if (btnBack) {
            btnBack.disabled = this.currentStep <= 1;
        }
    }

    initializeFirstStep() {
        this.updateNavigationButtons();
        this.validateCurrentStep();
    }

    initializeUploads() {
        // Logo upload
        this.initSingleUpload('logoUpload', 'logo_file', 'logo_file', ['image/*', '.svg']);
        
        // Brand files upload
        this.initMultipleUpload('brandFilesUpload', 'brand_files', 'brand_files');
        
        // Product images upload (4 images)
        for (let i = 1; i <= 4; i++) {
            this.initProductImageUpload(i);
        }
        
        // Product gallery upload
        this.initMultipleUpload('productGalleryUpload', 'galeria_producto', 'galeria_producto');
        
        // Avatar reference uploads
        this.initSingleUpload('avatarImageUpload', 'avatar_imagen_ref', 'avatar_imagen_ref', ['image/*']);
        this.initSingleUpload('avatarVideoUpload', 'avatar_video_ref', 'avatar_video_ref', ['video/*']);
    }

    initProductImageUpload(slotNumber) {
        const slot = document.querySelector(`[data-slot="${slotNumber}"]`);
        const input = document.getElementById(`imagen_producto_${slotNumber}`);
        
        if (!slot || !input) {
            console.warn(`Product image slot ${slotNumber} not found`);
            return;
        }
        
        const placeholder = slot.querySelector('.upload-placeholder');
        const preview = slot.querySelector('.upload-preview');
        const removeBtn = slot.querySelector('.remove-image');
        const fieldName = `imagen_producto_${slotNumber}`;
        
        // Click to upload
        placeholder?.addEventListener('click', () => {
            input.click();
        });
        
        // File change handler
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleProductImageUpload(file, fieldName, slot, slotNumber);
                }
            });
        }
        
        // Remove image
        removeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeProductImage(fieldName, input, slot);
        });
        
        // Drag and drop
        if (slot) {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('dragover');
            });
            
            slot.addEventListener('dragleave', () => {
                slot.classList.remove('dragover');
            });
            
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('dragover');
                
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    this.handleProductImageUpload(file, fieldName, slot, slotNumber);
                }
            });
        }
    }

    handleProductImageUpload(file, fieldName, slot, slotNumber) {
        // Validate file
        if (!file.type.startsWith('image/')) {
            this.showError('Por favor selecciona un archivo de imagen válido.');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB limit for images
            this.showError('La imagen no puede ser mayor a 5MB.');
            return;
        }

        // Store file
        this.formData[fieldName] = file;
        this.uploadedFiles.set(fieldName, file);
        
        // Show preview
        const placeholder = slot.querySelector('.upload-placeholder');
        const preview = slot.querySelector('.upload-preview');
        const img = preview?.querySelector('img');
        
        if (img && placeholder && preview) {
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
                placeholder.style.display = 'none';
                preview.style.display = 'block';
                
                // Add upload animation
                slot.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    slot.style.transform = '';
                }, 200);
            };
            reader.readAsDataURL(file);
        }
        
        this.validateCurrentStep();
        console.log(`Image ${slotNumber} uploaded:`, file.name);
    }

    removeProductImage(fieldName, input, slot) {
        this.formData[fieldName] = null;
        this.uploadedFiles.delete(fieldName);
        input.value = '';
        
        const placeholder = slot.querySelector('.upload-placeholder');
        const preview = slot.querySelector('.upload-preview');
        
        if (placeholder && preview) {
            placeholder.style.display = 'flex';
            preview.style.display = 'none';
        }
        
        this.validateCurrentStep();
    }

    initSingleUpload(containerId, fieldName, inputId, acceptTypes = ['*/*']) {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        
        if (!container || !input) {
            console.warn(`Upload container ${containerId} or input ${inputId} not found`);
            return;
        }
        
        const uploadZone = container.querySelector('.upload-zone') || container;
        const placeholder = container.querySelector('.upload-placeholder');
        const preview = container.querySelector('.upload-preview');
        const removeBtn = container.querySelector('.remove-file');
        
        console.log(`Initializing upload for ${containerId}`, { container, input, uploadZone, placeholder, preview });
        
        // Click to upload - check if uploadZone exists
        if (uploadZone) {
            uploadZone.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-file')) {
                    console.log(`Clicking to upload for ${fieldName}`);
                    input.click();
                }
            });
        }
        
        // File change handler
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    console.log(`File selected for ${fieldName}:`, file.name);
                    this.handleSingleFileUpload(file, fieldName, placeholder, preview, input);
                }
            });
        }
        
        // Remove file
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeSingleFile(fieldName, input, placeholder, preview);
            });
        }
        
        // Drag and drop - check if uploadZone exists
        if (uploadZone) {
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('dragover');
            });
            
            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('dragover');
            });
            
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('dragover');
                
                const file = e.dataTransfer.files[0];
                if (file) {
                    console.log(`File dropped for ${fieldName}:`, file.name);
                    // Set the file to input and trigger change
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                input.files = dataTransfer.files;
                
                this.handleSingleFileUpload(file, fieldName, placeholder, preview, input);
            }
        });
        }
    }

    initMultipleUpload(containerId, fieldName, inputId) {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        
        if (!container || !input) return;
        
        const uploadZone = container.querySelector('.upload-zone');
        const filesList = document.getElementById(inputId.replace('Upload', 'List'));
        
        // Click to upload
        if (uploadZone) {
            uploadZone.addEventListener('click', () => {
                input.click();
            });
        }
        
        // File change handler
        if (input) {
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                files.forEach(file => {
                    this.handleMultipleFileUpload(file, fieldName, filesList);
                });
            });
        }
        
        // Drag and drop
        if (uploadZone) {
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('dragover');
            });
            
            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('dragover');
            });
            
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('dragover');
                
                const files = Array.from(e.dataTransfer.files);
                files.forEach(file => {
                    this.handleMultipleFileUpload(file, fieldName, filesList);
                });
            });
        }
    }

    handleSingleFileUpload(file, fieldName, placeholder, preview, input) {
        console.log(`Handling upload for ${fieldName}:`, file);
        
        // Validate file size
        const maxSize = fieldName === 'avatar_video_ref' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError(`El archivo no puede ser mayor a ${maxSize / (1024 * 1024)}MB.`);
            return;
        }

        // Store file
        this.formData[fieldName] = file;
        this.uploadedFiles.set(fieldName, file);
        
        console.log(`File stored for ${fieldName}`, this.formData[fieldName]);
        
        // Show preview
        if (preview && placeholder) {
            const img = preview.querySelector('img');
            const video = preview.querySelector('video');
            const fileName = preview.querySelector('.file-name');
            const fileSize = preview.querySelector('.file-size');
            
            if (file.type.startsWith('image/') && img) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                    img.style.display = 'block';
                    if (video) video.style.display = 'none';
                    
                    placeholder.style.display = 'none';
                    preview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/') && video) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    video.src = e.target.result;
                    video.style.display = 'block';
                    if (img) img.style.display = 'none';
                    
                    placeholder.style.display = 'none';
                    preview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            } else {
                // For other file types, just show file info
                placeholder.style.display = 'none';
                preview.style.display = 'flex';
                if (img) img.style.display = 'none';
                if (video) video.style.display = 'none';
            }
            
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        }
        
        this.validateCurrentStep();
    }

    handleMultipleFileUpload(file, fieldName, filesList) {
        if (file.size > 10 * 1024 * 1024) {
            this.showError('Cada archivo no puede ser mayor a 10MB.');
            return;
        }

        if (!this.formData[fieldName]) {
            this.formData[fieldName] = [];
        }
        
        this.formData[fieldName].push(file);
        
        // Show in list
        if (filesList) {
            filesList.style.display = 'block';
            
            const fileItem = document.createElement('div');
            fileItem.className = 'uploaded-file';
            fileItem.innerHTML = `
                <div class="file-icon">
                    <i class="fas fa-file"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <button type="button" class="remove-file">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Remove file handler
            fileItem.querySelector('.remove-file').addEventListener('click', () => {
                const index = this.formData[fieldName].indexOf(file);
                if (index > -1) {
                    this.formData[fieldName].splice(index, 1);
                }
                fileItem.remove();
                
                if (this.formData[fieldName].length === 0) {
                    filesList.style.display = 'none';
                }
                
                this.validateCurrentStep();
            });
            
            filesList.appendChild(fileItem);
        }
        
        this.validateCurrentStep();
    }

    removeSingleFile(fieldName, input, placeholder, preview) {
        this.formData[fieldName] = null;
        this.uploadedFiles.delete(fieldName);
        input.value = '';
        
        placeholder.style.display = 'flex';
        preview.style.display = 'none';
        
        this.validateCurrentStep();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateCharCounter(element) {
        const counter = element.parentNode.querySelector('.char-counter');
        if (counter) {
            const maxLength = element.maxLength || 0;
            const currentLength = element.value.length;
            counter.textContent = `${currentLength}/${maxLength}`;
            
            if (currentLength > maxLength * 0.9) {
                counter.style.color = 'var(--warning-color)';
            } else {
                counter.style.color = 'var(--text-muted)';
            }
        }
    }

    addRipple(element) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(253, 98, 79, 0.3);
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.6s ease;
            pointer-events: none;
            width: 100px;
            height: 100px;
            top: 50%;
            left: 50%;
        `;
        
        element.style.position = 'relative';
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    showError(message) {
        // Simple error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: var(--error-color);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            z-index: 1000;
            font-weight: 500;
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    skipToEnd() {
        if (confirm('¿Estás seguro de que quieres saltar la configuración? Puedes completarla después.')) {
            this.completeOnboarding(true);
        }
    }

    completeOnboarding(skipped = false) {
        if (skipped) {
            console.log('Onboarding skipped:', this.formData);
        } else {
            // Show success screen
            this.showSuccessScreen();
            return;
        }
        
        // Save data and redirect
        this.saveDataAndRedirect(skipped);
    }

    showSuccessScreen() {
        // Hide all slides
        document.querySelectorAll('.question-slide').forEach(slide => {
            slide.style.display = 'none';
            slide.classList.remove('active');
        });

        // Show success screen
        const successScreen = document.querySelector('[data-step="success"]');
        if (successScreen) {
            successScreen.style.display = 'flex';
            successScreen.classList.add('active');
        }

        // Hide navigation
        document.querySelector('.navigation-buttons').style.display = 'none';
        document.querySelector('.skip-section').style.display = 'none';

        // Handle dashboard button
        const dashboardBtn = document.getElementById('btnGoToDashboard');
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                this.saveDataAndRedirect(false);
            });
        }
    }

    saveDataAndRedirect(skipped) {
        // Prepare data for saving
        const userData = {
            formData: this.formData,
            uploadedFiles: Array.from(this.uploadedFiles.entries()),
            completedAt: new Date().toISOString(),
            skipped: skipped,
            version: 'new_complete'
        };

        // Save to app state if available
        if (window.AppState) {
            window.AppState.setOnboardingData(this.formData);
            
            // Create user profile
            const userProfile = {
                name: 'Usuario',
                email: 'usuario@email.com', // Default email
                plan: 'pro', // Default plan
                createdAt: new Date().toISOString()
            };
            
            window.AppState.login(userProfile);
        }

        // Save to localStorage for demo compatibility
        localStorage.setItem('ugc_user_data', JSON.stringify(userData));
        
        console.log('Complete onboarding data:', userData);
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
        }
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .upload-zone.dragover {
        border-color: var(--primary-color);
        background: rgba(253, 98, 79, 0.1);
        transform: scale(1.02);
    }
`;
document.head.appendChild(style);

// ========================
// SUPABASE INTEGRATION
// ========================

/**
 * Integración de Supabase para el onboarding
 */
class OnboardingSupabaseIntegration {
    /**
     * Guardar datos de onboarding en Supabase
     */
    static async saveOnboardingDataToSupabase(formData, uploadedFiles) {
        if (!window.supabaseClient?.isReady()) {
            throw new Error('Supabase no está disponible');
        }

        // Obtener usuario actual del sessionStorage
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        if (!currentUser.id) {
            throw new Error('Usuario no identificado');
        }

        try {
            // 1. Actualizar datos del usuario con onboarding completo
            await window.supabaseClient.saveOnboardingData(currentUser.id, this.formData);

            // 2. Crear proyecto de marca
            const brandProject = {
                name: this.formData.nombre_marca || 'Mi Marca',
                description: `Proyecto de marca para ${this.formData.nombre_marca}`,
                project_type: 'brand',
                settings: {
                    sitio_web: this.formData.sitio_web,
                    instagram_url: this.formData.instagram_url,
                    tiktok_url: this.formData.tiktok_url,
                    mercado_objetivo: this.formData.mercado_objetivo,
                    idiomas_contenido: this.formData.idiomas_contenido,
                    tono_voz: this.formData.tono_voz,
                    palabras_usar: this.formData.palabras_usar,
                    palabras_evitar: this.formData.palabras_evitar,
                    reglas_creativas: this.formData.reglas_creativas
                }
            };

            const project = await window.supabaseClient.saveProject(currentUser.id, brandProject);
            console.log('✅ Proyecto de marca guardado:', project);

            // 3. Crear producto principal
            const mainProduct = {
                name: this.formData.tipo_producto || 'Mi Producto',
                description: this.formData.descripcion_producto,
                category: this.formData.tipo_producto,
                brand: this.formData.nombre_marca,
                price: parseFloat(this.formData.precio_producto) || 0,
                currency: this.formData.moneda || 'USD',
                specifications: {
                    beneficios: [
                        this.formData.beneficio_1,
                        this.formData.beneficio_2,
                        this.formData.beneficio_3
                    ].filter(b => b),
                    modo_uso: this.formData.modo_uso,
                    ingredientes: this.formData.ingredientes,
                    diferenciacion: this.formData.diferenciacion,
                    variantes: this.formData.variantes_producto
                },
                images: Array.from(this.uploadedFiles.values())
                    .filter(f => f.type === 'product')
                    .map(f => f.url || f.name)
            };

            const product = await window.supabaseClient.saveProduct(currentUser.id, mainProduct);
            console.log('✅ Producto principal guardado:', product);

            // 4. Crear avatar/creador
            const avatar = {
                name: `Avatar ${this.formData.tipo_creador}`,
                avatar_type: this.formData.tipo_creador === 'IA' ? 'ai' : 'human',
                description: `Avatar creado durante onboarding`,
                characteristics: {
                    rango_edad: this.formData.rango_edad,
                    genero: this.formData.genero_avatar,
                    apariencia: this.formData.apariencia_fisica,
                    energia: this.formData.energia_avatar,
                    idiomas: this.formData.idiomas_avatar,
                    valores: this.formData.valores_avatar
                },
                appearance: {
                    descripcion: this.formData.apariencia_fisica,
                    energia: this.formData.energia_avatar
                },
                voice_settings: {
                    timbre: this.formData.timbre_voz,
                    velocidad: this.formData.velocidad_voz,
                    acento: this.formData.acento_voz
                },
                metadata: {
                    referencias_imagen: this.uploadedFiles.get('avatar_imagen_ref')?.name,
                    referencias_video: this.uploadedFiles.get('avatar_video_ref')?.name
                }
            };

            const savedAvatar = await window.supabaseClient.saveAvatar(currentUser.id, avatar);
            console.log('✅ Avatar guardado:', savedAvatar);

            // 5. Registrar evento de onboarding completado
            try {
                if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                    window.analyticsEngine.track('onboarding_completed', {
                        steps_completed: this.totalSteps,
                        brand_name: this.formData.nombre_marca,
                        product_type: this.formData.tipo_producto,
                        avatar_type: this.formData.tipo_creador,
                        completion_time: Date.now()
                    });
                }
            } catch (error) {
                console.warn('⚠️ Error en analytics tracking (onboarding_completed):', error);
            }

            console.log('✅ Datos de onboarding guardados en Supabase exitosamente');
            return true;

        } catch (error) {
            console.error('❌ Error guardando datos en Supabase:', error);
            throw error;
        }
    }
    
    /**
     * Método actualizado para guardar datos con Supabase
     */
    async saveDataAndRedirect(skipped) {
        try {
            // Intentar guardar en Supabase primero
            if (!skipped && window.supabaseClient?.isReady()) {
                const currentUser = await window.supabaseClient.getCurrentUser();
                if (currentUser) {
                    await this.saveAllDataToSupabase(currentUser.id);
                }
            }
        } catch (error) {
            console.error('Error guardando en Supabase:', error);
            // Continuar con guardado local como fallback
        }
        
        // Prepare data for saving
        const userData = {
            formData: this.formData,
            uploadedFiles: Array.from(this.uploadedFiles.entries()),
            completedAt: new Date().toISOString(),
            skipped: skipped,
            version: 'new_complete'
        };

        // Save to app state if available
        if (window.AppState) {
            window.AppState.setOnboardingData(this.formData);
            
            // Create user profile
            const userProfile = {
                name: 'Usuario',
                email: 'usuario@email.com', // Default email
                plan: 'pro', // Default plan
                createdAt: new Date().toISOString()
            };
            
            window.AppState.login(userProfile);
        }

        // Save to localStorage for demo compatibility
        localStorage.setItem('ugc_user_data', JSON.stringify(userData));
        
        console.log('Complete onboarding data:', userData);
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
    }


    showStep(stepNumber) {
        this.isTransitioning = true;
        
        // Hide all steps
        const allSteps = document.querySelectorAll('.question-slide');
        allSteps.forEach(step => step.classList.remove('active'));
        
        // Show current step
        const currentStep = document.querySelector(`[data-step="${stepNumber}"]`);
        if (currentStep) {
            currentStep.classList.add('active');
        }
        
        // Update navigation buttons
        this.updateNavigationButtons();
        
        setTimeout(() => {
            this.isTransitioning = false;
        }, 300);
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const currentStepElement = document.getElementById('currentStep');
        
        if (progressFill) {
            const percentage = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${percentage}%`;
        }
        
        if (currentStepElement) {
            currentStepElement.textContent = this.currentStep;
        }
    }

    updateNavigationButtons() {
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        
        if (btnBack) {
            btnBack.disabled = this.currentStep <= 1;
        }
        
        if (btnNext) {
            btnNext.disabled = !this.validateCurrentStep();
            
            if (this.currentStep >= this.totalSteps) {
                btnNext.textContent = 'Finalizar';
            } else {
                btnNext.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
            }
        }
    }

    validateCurrentStep() {
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) {
            console.warn(`No se encontró el slide para el paso ${this.currentStep}`);
            return false;
        }

        // Validar inputs de texto requeridos
        const textInputs = currentSlide.querySelectorAll('input[type="text"], textarea, input[type="url"], input[type="number"]');
        for (let input of textInputs) {
            if (input.required) {
                const value = input.value.trim();
                if (!value) {
                    console.log(`Input requerido vacío: ${input.id}`);
                    return false;
                }
                
                // Validar longitud mínima según el tipo de input
                const minLength = this.getMinimumLength(input);
                if (value.length < minLength) {
                    console.log(`Input ${input.id} muy corto: ${value.length} < ${minLength}`);
                    return false;
                }
                
                // Validaciones específicas por tipo
                if (input.type === 'url' && !this.isValidUrl(value)) {
                    console.log(`URL inválida: ${input.id} = ${value}`);
                    return false;
                }
                
                if (input.type === 'number' && isNaN(parseFloat(value))) {
                    console.log(`Número inválido: ${input.id} = ${value}`);
                    return false;
                }
            }
        }

        // Validar opciones de selección única
        const singleSelectCards = currentSlide.querySelectorAll('.option-card:not(.multi-select)');
        if (singleSelectCards.length > 0) {
            const hasSelection = currentSlide.querySelector('.option-card.selected:not(.multi-select)');
            if (!hasSelection) {
                console.log(`No hay opción seleccionada en paso ${this.currentStep}`);
                return false;
            }
        }

        // Validar opciones de selección múltiple
        const multiSelectCards = currentSlide.querySelectorAll('.option-card.multi-select');
        if (multiSelectCards.length > 0) {
            const selectedMulti = currentSlide.querySelectorAll('.option-card.multi-select.selected');
            if (selectedMulti.length === 0) {
                console.log(`No hay opciones múltiples seleccionadas en paso ${this.currentStep}`);
                return false;
            }
        }

        // Validar archivos requeridos
        const fileInputs = currentSlide.querySelectorAll('input[type="file"]');
        for (let input of fileInputs) {
            if (input.required && input.files.length === 0) {
                console.log(`Archivo requerido no subido: ${input.id}`);
                return false;
            }
        }

        // Validaciones específicas por paso
        const stepValidation = this.validateSpecificStep(this.currentStep, currentSlide);
        if (!stepValidation) {
            console.log(`Validación específica falló para paso ${this.currentStep}`);
            return false;
        }

        console.log(`✅ Paso ${this.currentStep} válido`);
        return true;
    }

    getMinimumLength(input) {
        // Longitudes mínimas específicas por tipo de input
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
            'valores_avatar': 5
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

    validateSpecificStep(step, slide) {
        switch (step) {
            case 1: // Nombre de marca
                const nombreMarca = slide.querySelector('#nombre_marca');
                return nombreMarca && nombreMarca.value.trim().length >= 2;
                
            case 2: // Sitio web o red social (opcional)
                return true; // Es opcional
                
            case 3: // Mercado objetivo
                const mercadoSelected = slide.querySelectorAll('.option-card.multi-select.selected');
                return mercadoSelected.length > 0;
                
            case 4: // Idiomas para contenido
                const idiomasSelected = slide.querySelectorAll('.option-card.multi-select.selected');
                return idiomasSelected.length > 0;
                
            case 5: // Tono de voz
                const tonoSelected = slide.querySelector('.option-card.selected:not(.multi-select)');
                return tonoSelected !== null;
                
            case 6: // Palabras a usar (opcional)
                return true; // Es opcional
                
            case 7: // Palabras a evitar (opcional)
                return true; // Es opcional
                
            case 8: // Reglas creativas (opcional)
                return true; // Es opcional
                
            case 9: // Logo oficial (opcional)
                return true; // Es opcional
                
            case 10: // Archivos adicionales (opcional)
                return true; // Es opcional
                
            case 11: // Tipo de producto
                const tipoProducto = slide.querySelector('.option-card.selected:not(.multi-select)');
                return tipoProducto !== null;
                
            case 12: // Descripción del producto
                const descripcion = slide.querySelector('#descripcion_producto');
                return descripcion && descripcion.value.trim().length >= 10;
                
            case 13: // Beneficios principales
                const beneficio1 = slide.querySelector('#beneficio_1');
                const beneficio2 = slide.querySelector('#beneficio_2');
                const beneficio3 = slide.querySelector('#beneficio_3');
                return beneficio1 && beneficio1.value.trim().length >= 5 &&
                       beneficio2 && beneficio2.value.trim().length >= 5 &&
                       beneficio3 && beneficio3.value.trim().length >= 5;
                
            case 14: // Diferenciación
                const diferenciacion = slide.querySelector('#diferenciacion');
                return diferenciacion && diferenciacion.value.trim().length >= 10;
                
            case 15: // Modo de uso
                const modoUso = slide.querySelector('#modo_uso');
                return modoUso && modoUso.value.trim().length >= 10;
                
            case 16: // Ingredientes
                const ingredientes = slide.querySelector('#ingredientes');
                return ingredientes && ingredientes.value.trim().length >= 5;
                
            case 17: // Precio
                const precio = slide.querySelector('#precio_producto');
                return precio && !isNaN(parseFloat(precio.value)) && parseFloat(precio.value) > 0;
                
            case 18: // Variantes (opcional)
                return true; // Es opcional
                
            case 19: // Imágenes del producto
                const imagenes = slide.querySelectorAll('input[type="file"]');
                let imagenesSubidas = 0;
                imagenes.forEach(input => {
                    if (input.files.length > 0) imagenesSubidas++;
                });
                return imagenesSubidas >= 2; // Mínimo 2 imágenes
                
            case 20: // Galería adicional (opcional)
                return true; // Es opcional
                
            case 21: // Tipo de creador
                const tipoCreador = slide.querySelector('.creator-card.selected');
                return tipoCreador !== null;
                
            case 22: // Rango de edad
                const rangoEdad = slide.querySelector('.option-card.selected:not(.multi-select)');
                return rangoEdad !== null;
                
            case 23: // Género
                const genero = slide.querySelector('.option-card.selected:not(.multi-select)');
                return genero !== null;
                
            case 24: // Apariencia física
                const apariencia = slide.querySelector('#apariencia_fisica');
                return apariencia && apariencia.value.trim().length >= 10;
                
            case 25: // Energía
                const energia = slide.querySelector('.option-card.selected:not(.multi-select)');
                return energia !== null;
                
            case 26: // Idiomas del avatar
                const idiomasAvatar = slide.querySelectorAll('.option-card.multi-select.selected');
                return idiomasAvatar.length > 0;
                
            case 27: // Valores
                const valores = slide.querySelectorAll('.option-card.multi-select.selected');
                return valores.length > 0;
                
            case 28: // Características de voz (opcional)
                return true; // Es opcional
                
            case 29: // Referencias opcionales
                return true; // Es opcional
                
            default:
                return true;
        }
    }

    collectStepData() {
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) return;

        // Collect text inputs
        const textInputs = currentSlide.querySelectorAll('input[type="text"], textarea');
        textInputs.forEach(input => {
            if (input.id && input.value) {
                this.formData[input.id] = input.value.trim();
            }
        });

        // Collect selected options
        const selectedOptions = currentSlide.querySelectorAll('.option-card.selected');
        selectedOptions.forEach(option => {
            const fieldName = this.getFieldNameForStep(this.currentStep);
            if (fieldName) {
                const value = option.dataset.value;
                if (Array.isArray(this.formData[fieldName])) {
                    if (!this.formData[fieldName].includes(value)) {
                        this.formData[fieldName].push(value);
                    }
                } else {
                    this.formData[fieldName] = value;
                }
            }
        });

        // Collect file uploads
        const fileInputs = currentSlide.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            if (input.id && input.files.length > 0) {
                this.formData[input.id] = input.files[0];
            }
        });
    }

    getFieldNameForStep(step) {
        const stepMapping = {
            1: 'nombre_marca',
            2: null, // Social links handled separately
            3: 'mercado_objetivo',
            4: 'idiomas_contenido',
            5: 'tono_voz',
            6: 'palabras_usar',
            7: 'palabras_evitar',
            8: 'reglas_creativas',
            9: null, // Logo upload
            10: null, // Brand files upload
            11: 'tipo_producto',
            12: 'descripcion_producto',
            13: null, // Benefits handled separately
            14: 'diferenciacion',
            15: 'modo_uso',
            16: 'ingredientes',
            17: 'precio_producto',
            18: 'variantes_producto',
            19: null, // Main product image
            20: null, // Product gallery
            21: 'tipo_creador',
            22: 'rango_edad',
            23: 'genero_avatar',
            24: 'apariencia_fisica',
            25: 'energia_avatar',
            26: 'idiomas_avatar',
            27: 'valores_avatar',
            28: null, // Voice characteristics handled separately
            29: null  // Avatar references
        };
        
        return stepMapping[step];
    }

    async completeOnboarding() {
        try {
            // Show loading state
            this.showLoadingState('Guardando datos...');

            // Get current user
            const currentUser = await window.supabaseClient.getCurrentUser();
            if (!currentUser) {
                throw new Error('Usuario no autenticado');
            }

            // Save all data to Supabase with correct hierarchy
            await this.saveAllDataToSupabase(currentUser.id);

            // Verify data was saved
            const verification = await this.verifyDataSaved(currentUser.id);
            if (!verification.success) {
                throw new Error(verification.error);
            }

            // Mark onboarding as completed
            await this.markOnboardingCompleted(currentUser.id);

            // Hide loading and show success
            this.hideLoadingState();
            this.showSuccessPage();

            // Redirect to dashboard after a delay
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);

        } catch (error) {
            console.error('Error completing onboarding:', error);
            this.hideLoadingState();
            this.showErrorState(
                `Error guardando datos: ${error.message}`,
                () => this.completeOnboarding(),
                'Reintentar'
            );
        }
    }

    async saveAllDataToSupabase(userId) {
        try {
            if (!window.supabaseClient) {
                throw new Error('Supabase client no está disponible');
            }

            // PASO 1: Crear proyecto (RAÍZ) - Campos obligatorios: user_id, name, country
            const projectData = {
                user_id: userId,
                name: this.formData.nombre_marca || 'Mi Proyecto',
                country: 'MX', // País por defecto
                website: this.formData.sitio_web || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: project, error: projectError } = await window.supabaseClient.client
                .from('projects')
                .insert([projectData])
                .select()
                .single();

            if (projectError) throw projectError;

            // PASO 2: Crear brand guidelines (requiere project_id)
            const brandGuidelinesData = {
                project_id: project.id,
                tone_of_voice: this.formData.tono_voz || '',
                keywords_yes: this.formData.palabras_usar ? [this.formData.palabras_usar] : [],
                keywords_no: this.formData.palabras_evitar ? [this.formData.palabras_evitar] : [],
                dos_donts: this.formData.reglas_creativas || '',
                created_at: new Date().toISOString()
            };

            const { data: brandGuidelines, error: brandGuidelinesError } = await window.supabaseClient.client
                .from('brand_guidelines')
                .insert([brandGuidelinesData])
                .select()
                .single();

            if (brandGuidelinesError) throw brandGuidelinesError;

            // PASO 3: Crear producto (requiere project_id)
            const productData = {
                project_id: project.id,
                product_type: this.formData.tipo_producto || 'físico',
                short_desc: this.formData.descripcion_producto || '',
                benefits: [
                    this.formData.beneficio_1,
                    this.formData.beneficio_2,
                    this.formData.beneficio_3
                ].filter(b => b && b.trim()),
                differentiators: this.formData.diferenciacion ? [this.formData.diferenciacion] : [],
                usage_steps: this.formData.modo_uso ? [this.formData.modo_uso] : [],
                ingredients: this.formData.ingredientes ? [this.formData.ingredientes] : [],
                price: parseFloat(this.formData.precio_producto) || 0,
                variants: this.formData.variantes_producto ? [this.formData.variantes_producto] : [],
                created_at: new Date().toISOString()
            };

            const { data: product, error: productError } = await window.supabaseClient.client
                .from('products')
                .insert([productData])
                .select()
                .single();

            if (productError) throw productError;

            // PASO 4: Crear avatar (requiere project_id)
            const avatarData = {
                project_id: project.id,
                avatar_type: this.formData.tipo_creador || 'IA',
                traits: {
                    age_range: this.formData.rango_edad || '',
                    gender: this.formData.genero_avatar || '',
                    physical_appearance: this.formData.apariencia_fisica || ''
                },
                energy: this.formData.energia_avatar || '',
                gender: this.formData.genero_avatar || '',
                voice: {
                    tone: this.formData.timbre_voz || '',
                    speed: this.formData.velocidad_voz || '',
                    accent: this.formData.acento_voz || ''
                },
                languages: this.formData.idiomas_avatar || ['español'],
                values: this.formData.valores_avatar || [],
                created_at: new Date().toISOString()
            };

            const { data: avatar, error: avatarError } = await window.supabaseClient.client
                .from('avatars')
                .insert([avatarData])
                .select()
                .single();

            if (avatarError) throw avatarError;

            return {
                project,
                brandGuidelines,
                product,
                avatar
            };

        } catch (error) {
            throw error;
        }
    }

    async verifyDataSaved(userId) {
        try {
            // Verificar que existe al menos un proyecto
            const { data: projects, error: projectsError } = await window.supabaseClient.client
                .from('projects')
                .select('id')
                .eq('user_id', userId);

            if (projectsError || !projects || projects.length === 0) {
                return { success: false, error: 'No se encontraron proyectos guardados' };
            }

            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async markOnboardingCompleted(userId) {
        try {
            const { error } = await window.supabaseClient.client
                .from('user_profiles')
                .update({ 
                    onboarding_completed: true,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;

        } catch (error) {
            console.warn('Error marking onboarding as completed:', error);
        }
    }

    showLoadingState(message) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <h3>${message}</h3>
                <p>Por favor espera mientras guardamos tus datos...</p>
            </div>
        `;
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
            z-index: 10000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .loading-container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
            }
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid #ff6b6b;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 1rem;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(loadingOverlay);
    }

    hideLoadingState() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            document.body.removeChild(loadingOverlay);
        }
    }

    showErrorState(message, retryCallback, retryText) {
        const errorOverlay = document.createElement('div');
        errorOverlay.id = 'error-overlay';
        errorOverlay.innerHTML = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <h3>Error al guardar datos</h3>
                <p>${message}</p>
                <div class="error-buttons">
                    <button id="retry-btn" class="btn-retry">${retryText || 'Reintentar'}</button>
                    <button id="cancel-btn" class="btn-cancel">Cancelar</button>
                </div>
            </div>
        `;
        errorOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .error-container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
                max-width: 400px;
            }
            .error-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
            .error-buttons {
                display: flex;
                gap: 1rem;
                justify-content: center;
                margin-top: 1.5rem;
            }
            .btn-retry, .btn-cancel {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .btn-retry {
                background: #ff6b6b;
                color: white;
            }
            .btn-retry:hover {
                background: #ff5252;
                transform: translateY(-2px);
            }
            .btn-cancel {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }
            .btn-cancel:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(errorOverlay);

        // Event listeners
        document.getElementById('retry-btn').addEventListener('click', () => {
            document.body.removeChild(errorOverlay);
            if (retryCallback) retryCallback();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            document.body.removeChild(errorOverlay);
        });
    }

    showSuccessPage() {
        const successOverlay = document.createElement('div');
        successOverlay.id = 'success-overlay';
        successOverlay.innerHTML = `
            <div class="success-container">
                <div class="success-icon">✅</div>
                <h3>¡Configuración Completada!</h3>
                <p>Todos tus datos se han guardado correctamente.</p>
                <p>Redirigiendo al dashboard...</p>
            </div>
        `;
        successOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .success-container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
            }
            .success-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(successOverlay);
    }

    initializeFirstStep() {
        this.showStep(1);
        this.updateProgress();
    }

    initializeUploads() {
        // Initialize file upload handlers
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.formData[e.target.id] = e.target.files[0];
                    this.updateNavigationButtons();
                }
            });
        });

        // Initialize option card handlers
        const optionCards = document.querySelectorAll('.option-card');
        optionCards.forEach(card => {
            card.addEventListener('click', () => {
                const isMultiSelect = card.closest('.question-slide').querySelector('.multi-select') !== null;
                
                if (isMultiSelect) {
                    card.classList.toggle('selected');
                } else {
                    // Single select - remove other selections
                    const siblings = card.parentElement.querySelectorAll('.option-card');
                    siblings.forEach(sibling => sibling.classList.remove('selected'));
                    card.classList.add('selected');
                }
                
                this.updateNavigationButtons();
            });
        });

        // Initialize text input handlers
        const textInputs = document.querySelectorAll('input[type="text"], textarea');
        textInputs.forEach(input => {
            input.addEventListener('input', () => {
                this.updateNavigationButtons();
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    new NewOnboardingForm();
});