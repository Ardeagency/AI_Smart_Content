// New Onboarding JavaScript - Complete UGC Setup (Standalone)

class NewOnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 35;
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
            contexts: ''
        };
        
        this.optionalSteps = [2, 3, 4, 7, 8, 9, 10, 12, 16, 18, 20, 22, 24, 29, 31];
        this.uploadedFiles = {};
        
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupAfterDOM());
        } else {
            this.setupAfterDOM();
        }
    }
    
    setupAfterDOM() {
        this.bindEvents();
        this.bindInputEvents();
        this.bindOptionEvents();
        this.initializeFirstStep();
        this.initializeUploads();
        this.updateNavigationButtons();
    }

    bindEvents() {
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        const btnSkip = document.getElementById('btnSkip');

        if (btnNext) btnNext.addEventListener('click', () => this.nextStep());
        if (btnBack) btnBack.addEventListener('click', () => this.prevStep());
        if (btnSkip) btnSkip.addEventListener('click', () => this.skipToEnd());

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
        const textInputs = ['nombre_marca', 'sitio_web', 'instagram_url', 'tiktok_url', 
                           'palabras_usar', 'palabras_evitar', 'reglas_creativas',
                           'descripcion_producto', 'beneficio_1', 'beneficio_2', 'beneficio_3',
                           'diferenciacion', 'modo_uso', 'ingredientes', 'variantes_producto',
                           'apariencia_fisica', 'precio_producto', 'cta', 'cta_url'];

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
        if (!fieldName) return;

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
        
        this.updateFormData(fieldName, value);
        this.updateNavigationButtons();
    }

    toggleMultiOption(card) {
        const fieldName = this.getFieldNameForStep(this.currentStep);
        if (!fieldName) return;

        card.classList.toggle('selected');
        const value = card.dataset.value;
        
        if (card.classList.contains('selected')) {
                if (!this.formData[fieldName].includes(value)) {
                    this.formData[fieldName].push(value);
                }
            } else {
                this.formData[fieldName] = this.formData[fieldName].filter(v => v !== value);
            }
        
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
            12: 'descripcion_producto',
            13: 'beneficio_1',
            14: 'diferenciacion',
            15: 'modo_uso',
            16: 'ingredientes',
            17: 'precio_producto',
            18: 'variantes_producto',
            19: 'imagen_producto_1',
            20: 'galeria_producto',
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
            35: 'interests'
        };
        return fieldMap[step];
    }

    validateCurrentStep() {
        const currentSlide = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (!currentSlide) return false;

        let isValid = true;

        // Check required inputs
        const requiredInputs = currentSlide.querySelectorAll('input[required], textarea[required]');
        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                this.showInputError(input, 'Este campo es obligatorio');
                isValid = false;
            } else {
                this.clearInputError(input);
            }
        });

        // Check selected options
        const selectedOption = currentSlide.querySelector('.option-card.selected, .creator-card.selected');
        if (!selectedOption && !this.optionalSteps.includes(this.currentStep)) {
            isValid = false;
        }

        // Step-specific validation
        switch (this.currentStep) {
            case 1: // Nombre de marca
                const nombreMarca = document.getElementById('nombre_marca');
                if (nombreMarca && nombreMarca.value.trim().length < 2) {
                    this.showInputError(nombreMarca, 'Mínimo 2 caracteres');
                    isValid = false;
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
                
            case 12: // Descripción producto
                const descripcion = document.getElementById('descripcion_producto');
                if (descripcion && descripcion.value.trim().length < 10) {
                    this.showInputError(descripcion, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 13: // Beneficios
                const beneficio1 = document.getElementById('beneficio_1');
                const beneficio2 = document.getElementById('beneficio_2');
                const beneficio3 = document.getElementById('beneficio_3');
                
                if (beneficio1 && beneficio1.value.trim().length < 5) {
                    this.showInputError(beneficio1, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                if (beneficio2 && beneficio2.value.trim().length < 5) {
                    this.showInputError(beneficio2, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                if (beneficio3 && beneficio3.value.trim().length < 5) {
                    this.showInputError(beneficio3, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 14: // Diferenciación
                const diferenciacion = document.getElementById('diferenciacion');
                if (diferenciacion && diferenciacion.value.trim().length < 10) {
                    this.showInputError(diferenciacion, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 15: // Modo de uso
                const modoUso = document.getElementById('modo_uso');
                if (modoUso && modoUso.value.trim().length < 10) {
                    this.showInputError(modoUso, 'Mínimo 10 caracteres');
                    isValid = false;
                }
                break;
                
            case 16: // Ingredientes
                const ingredientes = document.getElementById('ingredientes');
                if (ingredientes && ingredientes.value.trim().length < 5) {
                    this.showInputError(ingredientes, 'Mínimo 5 caracteres');
                    isValid = false;
                }
                break;
                
            case 17: // Precio
                const precio = document.getElementById('precio_producto');
                if (precio && (!precio.value || parseFloat(precio.value) <= 0)) {
                    this.showInputError(precio, 'Precio debe ser mayor a 0');
                    isValid = false;
                }
                break;
                
            case 18: // Variantes - optional
                isValid = true;
                break;
                
            case 19: // Imágenes producto
                const imagen1 = document.getElementById('imagen_producto_1');
                const imagen2 = document.getElementById('imagen_producto_2');
                if ((!imagen1 || !imagen1.files[0]) && (!imagen2 || !imagen2.files[0])) {
                    isValid = false;
                }
                break;
                
            case 20: // Galería - optional
                isValid = true;
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
            this.currentStep--;
            this.showStep(this.currentStep);
            this.updateProgress();
        this.updateNavigationButtons();
        }
    }

    skipToEnd() {
        this.showLoadingState('Completando configuración...');
        
        setTimeout(() => {
            this.completeOnboarding(true);
        }, 2000);
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
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            const progress = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${progress}%`;
        }
    }

    updateNavigationButtons() {
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        const btnSkip = document.getElementById('btnSkip');

        if (btnNext) {
            btnNext.disabled = !this.validateCurrentStep();
        }

        if (btnBack) {
            btnBack.disabled = this.currentStep === 1;
        }

        if (btnSkip) {
            btnSkip.style.display = this.currentStep < this.totalSteps ? 'block' : 'none';
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

        // Collect file inputs
        const fileInputs = currentSlide.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            if (input.id && this.formData.hasOwnProperty(input.id)) {
                if (input.multiple) {
                    this.formData[input.id] = Array.from(input.files);
                } else {
                    this.formData[input.id] = input.files[0] || null;
                }
            }
        });

        // Collect selected options
        const selectedOption = currentSlide.querySelector('.option-card.selected, .creator-card.selected');
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
    }

    completeOnboarding(skipped = false) {
        this.hideLoadingState();
        
        if (!skipped) {
            this.collectAllFormData();
            this.saveOnboardingData();
        }
        
        this.showSuccessPage();
    }

    collectAllFormData() {
        // Collect all form data from all steps
        for (let step = 1; step <= this.totalSteps; step++) {
            const slide = document.querySelector(`[data-step="${step}"]`);
            if (slide) {
                this.collectStepData();
            }
        }
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
        // Hide form
        document.querySelector('.form-container').style.display = 'none';
        
        // Show success screen
        const successSlide = document.querySelector('[data-step="success"]');
        if (successSlide) {
            successSlide.style.display = 'block';
            successSlide.classList.add('active');
        }
        
        // Update progress to 100%
        this.updateProgress();
        
        // Update step counter
        const stepCounter = document.getElementById('currentStep');
        if (stepCounter) {
            stepCounter.textContent = this.totalSteps;
        }
        
        // Add click handler for dashboard button
        const btnGoToDashboard = document.getElementById('btnGoToDashboard');
        if (btnGoToDashboard) {
            btnGoToDashboard.addEventListener('click', () => {
                window.location.href = '/dashboard.html';
            });
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
        this.showStep(1);
        this.updateProgress();
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
            const productImageUpload = document.getElementById(`imagen_producto_${i}`);
            if (productImageUpload) {
                this.setupFileUpload(productImageUpload, `imagen_producto_${i}`);
            }
        }

        // Product gallery upload
        const productGalleryUpload = document.getElementById('productGalleryUpload');
        if (productGalleryUpload) {
            this.setupFileUpload(productGalleryUpload, 'galeria_producto', true);
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
        const preview = uploadZone.querySelector('.upload-preview');

        if (!fileInput || !placeholder || !preview) return;
        
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
        if (multiple) {
            this.formData[fieldName] = files;
            this.showMultipleFilePreview(files, preview);
        } else {
            this.formData[fieldName] = files[0];
            this.showSingleFilePreview(files[0], preview);
        }
        
        placeholder.style.display = 'none';
        preview.style.display = 'block';
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
            
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        }
        
    showMultipleFilePreview(files, preview) {
        const filesList = preview.parentNode.querySelector('.uploaded-files');
        if (filesList) {
            filesList.innerHTML = '';
            filesList.style.display = 'block';
            
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
            filesList.appendChild(fileItem);
            });
        }
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

// Global debugging functions
window.debugOnboarding = () => {
    console.log('Current Step:', window.onboardingForm.currentStep);
    console.log('Form Data:', window.onboardingForm.formData);
    console.log('Validation:', window.onboardingForm.validateCurrentStep());
};

window.forceCompleteOnboarding = () => {
    window.onboardingForm.completeOnboarding();
};
