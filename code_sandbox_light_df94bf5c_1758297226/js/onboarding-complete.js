// Complete Onboarding Form JavaScript - Full Schema Implementation

class CompleteOnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 25;
        this.formData = {
            // Producto
            nombre_producto: '',
            tipo_producto: '',
            categoria: '',
            subcategoria: '',
            descripcion: '',
            caracteristicas_principales: [],
            beneficios: [],
            imagenes_producto: [],
            
            // UGC Preferences
            plataforma_principal: '',
            tipo_contenido: [],
            presupuesto_mensual: 1000,
            numero_creadores: 5,
            frecuencia_contenido: '',
            duracion_preferida: '',
            tono_comunicacion: [],
            audiencia_objetivo: '',
            ubicacion_geografica: [],
            hashtags_relevantes: '',
            experiencia_previa: '',
            metricas_exito: [],
            otras_preferencias: '',
            
            // Brand
            nombre_marca: '',
            sitio_web: '',
            redes_sociales: {},
            industria: '',
            descripcion_marca: ''
        };
        this.isTransitioning = false;
        this.uploadedImages = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateProgress();
        this.initializeFirstQuestion();
        this.initImageUpload();
    }

    bindEvents() {
        // Navigation buttons
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        const btnSkip = document.getElementById('btnSkip');

        btnNext.addEventListener('click', () => this.nextStep());
        btnBack.addEventListener('click', () => this.prevStep());
        btnSkip.addEventListener('click', () => this.skipToEnd());

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
        // Step 1: Nombre del producto
        const productNameInput = document.getElementById('nombre_producto');
        if (productNameInput) {
            productNameInput.addEventListener('input', (e) => {
                this.formData.nombre_producto = e.target.value.trim();
                this.validateCurrentStep();
            });

            productNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 3: Categoría
        const categoryInput = document.getElementById('categoria');
        if (categoryInput) {
            categoryInput.addEventListener('input', (e) => {
                this.formData.categoria = e.target.value.trim();
                this.validateCurrentStep();
            });

            categoryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 4: Subcategoría
        const subcategoryInput = document.getElementById('subcategoria');
        if (subcategoryInput) {
            subcategoryInput.addEventListener('input', (e) => {
                this.formData.subcategoria = e.target.value.trim();
                this.validateCurrentStep();
            });

            subcategoryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.nextStep(); // Subcategoría es opcional
                }
            });
        }

        // Step 5: Descripción
        const descriptionInput = document.getElementById('descripcion');
        if (descriptionInput) {
            descriptionInput.addEventListener('input', (e) => {
                this.formData.descripcion = e.target.value.trim();
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });

            descriptionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 6: Características principales
        const characteristics = ['caracteristica_1', 'caracteristica_2', 'caracteristica_3', 'caracteristica_4'];
        characteristics.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    const value = e.target.value.trim();
                    if (value) {
                        this.formData.caracteristicas_principales[index] = value;
                    } else {
                        this.formData.caracteristicas_principales[index] = '';
                    }
                    // Limpiar elementos vacíos
                    this.formData.caracteristicas_principales = this.formData.caracteristicas_principales.filter(c => c.length > 0);
                    this.validateCurrentStep();
                });

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const nextInput = document.getElementById(characteristics[index + 1]);
                        if (nextInput) {
                            nextInput.focus();
                        } else if (this.validateCurrentStep()) {
                            this.nextStep();
                        }
                    }
                });
            }
        });

        // Range inputs (Steps 10, 11)
        this.bindRangeInputs();
        
        // Text areas and inputs for remaining steps
        this.bindTextInputs();
        
        // Social media inputs
        this.bindSocialInputs();
    }

    bindRangeInputs() {
        // Step 10: Presupuesto mensual
        const presupuestoRange = document.getElementById('presupuesto_mensual');
        if (presupuestoRange) {
            presupuestoRange.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.formData.presupuesto_mensual = value;
                this.updateRangeValue(e.target, `$${value.toLocaleString()}`);
                this.validateCurrentStep();
            });
        }

        // Step 11: Número de creadores
        const creadoresRange = document.getElementById('numero_creadores');
        if (creadoresRange) {
            creadoresRange.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.formData.numero_creadores = value;
                this.updateRangeValue(e.target, value.toString());
                this.validateCurrentStep();
            });
        }
    }

    bindTextInputs() {
        // Step 15: Audiencia objetivo
        const audienciaInput = document.getElementById('audiencia_objetivo');
        if (audienciaInput) {
            audienciaInput.addEventListener('input', (e) => {
                this.formData.audiencia_objetivo = e.target.value;
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });
        }

        // Step 17: Hashtags relevantes
        const hashtagsInput = document.getElementById('hashtags_relevantes');
        if (hashtagsInput) {
            hashtagsInput.addEventListener('input', (e) => {
                this.formData.hashtags_relevantes = e.target.value;
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });
        }

        // Step 20: Otras preferencias
        const otrasPreferenciasInput = document.getElementById('otras_preferencias');
        if (otrasPreferenciasInput) {
            otrasPreferenciasInput.addEventListener('input', (e) => {
                this.formData.otras_preferencias = e.target.value;
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });
        }

        // Step 21: Nombre de marca
        const nombreMarcaInput = document.getElementById('nombre_marca');
        if (nombreMarcaInput) {
            nombreMarcaInput.addEventListener('input', (e) => {
                this.formData.nombre_marca = e.target.value;
                this.validateCurrentStep();
            });
        }

        // Step 22: Sitio web
        const sitioWebInput = document.getElementById('sitio_web');
        if (sitioWebInput) {
            sitioWebInput.addEventListener('input', (e) => {
                this.formData.sitio_web = e.target.value;
                this.validateCurrentStep();
            });
        }

        // Step 25: Descripción de marca
        const descripcionMarcaInput = document.getElementById('descripcion_marca');
        if (descripcionMarcaInput) {
            descripcionMarcaInput.addEventListener('input', (e) => {
                this.formData.descripcion_marca = e.target.value;
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });
        }
    }

    bindSocialInputs() {
        // Step 23: Redes sociales
        const socialInputs = ['instagram', 'tiktok', 'facebook', 'youtube'];
        socialInputs.forEach(platform => {
            const input = document.getElementById(platform);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.formData.redes_sociales[platform] = e.target.value;
                    this.validateCurrentStep();
                });
            }
        });
    }

    updateRangeValue(rangeInput, displayValue) {
        const rangeValue = rangeInput.parentNode.querySelector('.range-value');
        if (rangeValue) {
            rangeValue.textContent = displayValue;
        }
    }

    bindOptionEvents() {
        // Option cards (grid style) - single select
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

        // Option items (list style)
        document.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectOption(item);
            });
        });

        // Multi-select options (legacy)
        document.querySelectorAll('.multi-option').forEach(option => {
            option.addEventListener('click', () => {
                this.toggleMultiOption(option);
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
        this.storeStepData(step, value);

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
        
        // Get field name for this step
        const fieldName = this.getFieldNameForStep(step);
        
        if (fieldName) {
            // Asegurar que el campo es un array
            if (!Array.isArray(this.formData[fieldName])) {
                this.formData[fieldName] = [];
            }
            
            if (element.classList.contains('selected')) {
                // Add to array if not exists
                if (!this.formData[fieldName].includes(value)) {
                    this.formData[fieldName].push(value);
                }
            } else {
                // Remove from array
                this.formData[fieldName] = this.formData[fieldName].filter(v => v !== value);
            }
            
            // Update hidden input
            const hiddenInput = document.getElementById(fieldName);
            if (hiddenInput) {
                hiddenInput.value = this.formData[fieldName].join(',');
            }
        }

        this.validateCurrentStep();
        console.log(`Multi-select updated:`, this.formData[fieldName]);
    }

    getFieldNameForStep(step) {
        const stepMapping = {
            2: 'tipo_producto',
            8: 'plataforma_principal',
            9: 'tipo_contenido',
            10: 'presupuesto_mensual',
            11: 'numero_creadores',
            12: 'frecuencia_contenido',
            13: 'duracion_preferida',
            14: 'tono_comunicacion',
            15: 'audiencia_objetivo',
            16: 'ubicacion_geografica',
            17: 'hashtags_relevantes',
            18: 'experiencia_previa',
            19: 'metricas_exito',
            20: 'otras_preferencias',
            21: 'nombre_marca',
            22: 'sitio_web',
            23: 'redes_sociales',
            24: 'industria',
            25: 'descripcion_marca'
        };
        
        return stepMapping[step];
    }

    storeStepData(step, value) {
        const field = this.getFieldNameForStep(step);
        
        if (field) {
            // Para campos que son arrays por defecto (multi-select)
            const arrayFields = ['tipo_contenido', 'tono_comunicacion', 'ubicacion_geografica', 'metricas_exito'];
            
            if (arrayFields.includes(field)) {
                if (!Array.isArray(this.formData[field])) {
                    this.formData[field] = [];
                }
                // Para single select que debe ser array, reemplazar
                if (field === 'tipo_contenido' || field === 'ubicacion_geografica' || field === 'metricas_exito') {
                    this.formData[field] = [value];
                }
            } else {
                this.formData[field] = value;
            }
            
            const hiddenInput = document.getElementById(field);
            if (hiddenInput) {
                hiddenInput.value = Array.isArray(this.formData[field]) ? this.formData[field].join(',') : this.formData[field];
            }
        }

        this.updateNextButton();
        console.log('Form data updated:', this.formData);
    }

    validateCurrentStep() {
        let isValid = false;
        
        switch(this.currentStep) {
            case 1:
                isValid = this.validateStep1();
                break;
            case 2:
                isValid = this.validateStep2();
                break;
            case 3:
                isValid = this.validateStep3();
                break;
            case 4:
                isValid = true; // Subcategoría es opcional
                break;
            case 5:
                isValid = this.validateStep5();
                break;
            case 6:
                isValid = this.validateStep6();
                break;
            case 7:
                isValid = this.validateStep7();
                break;
            case 8:
                isValid = this.validateStep8();
                break;
            case 9:
                isValid = this.validateStep9();
                break;
            case 10:
                isValid = this.validateStep10();
                break;
            case 11:
                isValid = this.validateStep11();
                break;
            case 12:
                isValid = this.validateStep12();
                break;
            case 13:
                isValid = this.validateStep13();
                break;
            case 14:
                isValid = this.validateStep14();
                break;
            case 15:
                isValid = this.validateStep15();
                break;
            case 16:
                isValid = this.validateStep16();
                break;
            case 17:
                isValid = this.validateStep17();
                break;
            case 18:
                isValid = this.validateStep18();
                break;
            case 19:
                isValid = this.validateStep19();
                break;
            case 20:
                isValid = true; // Optional
                break;
            case 21:
                isValid = this.validateStep21();
                break;
            case 22:
                isValid = true; // Website is optional
                break;
            case 23:
                isValid = true; // Social links are optional
                break;
            case 24:
                isValid = this.validateStep24();
                break;
            case 25:
                isValid = this.validateStep25();
                break;
            default:
                // For option-based steps, check if an option is selected
                const currentSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);
                const selected = currentSlide?.querySelector('.selected');
                isValid = !!selected;
        }

        this.updateNextButton(isValid);
        return isValid;
    }

    validateStep1() {
        const productName = this.formData.nombre_producto || '';
        return productName.length >= 2;
    }

    validateStep3() {
        const category = this.formData.categoria || '';
        return category.length >= 2;
    }

    validateStep5() {
        const description = this.formData.descripcion || '';
        return description.length >= 30;
    }

    validateStep6() {
        // Al menos 2 características son requeridas
        const characteristics = this.formData.caracteristicas_principales.filter(c => c.length >= 3);
        return characteristics.length >= 2;
    }

    validateStep7() {
        // Al menos 2 imágenes son requeridas
        return this.uploadedImages.length >= 2;
    }

    validateStep9() {
        // Al menos un tipo de contenido debe estar seleccionado
        const tipos = this.formData.tipo_contenido || [];
        return tipos.length > 0;
    }

    validateStep15() {
        const audiencia = this.formData.audiencia_objetivo || '';
        return audiencia.length >= 20;
    }

    validateStep17() {
        const hashtags = this.formData.hashtags_relevantes || '';
        return hashtags.length >= 5;
    }

    validateStep21() {
        const nombreMarca = this.formData.nombre_marca || '';
        return nombreMarca.length >= 2;
    }

    validateStep25() {
        const descripcion = this.formData.descripcion_marca || '';
        return descripcion.length >= 50;
    }

    // Funciones de validación faltantes
    validateStep2() {
        return !!this.formData.tipo_producto;
    }

    validateStep8() {
        return !!this.formData.plataforma_principal;
    }

    validateStep10() {
        return this.formData.presupuesto_mensual > 0;
    }

    validateStep11() {
        return this.formData.numero_creadores > 0;
    }

    validateStep12() {
        return !!this.formData.frecuencia_contenido;
    }

    validateStep13() {
        return !!this.formData.duracion_preferida;
    }

    validateStep14() {
        const tono = this.formData.tono_comunicacion || [];
        return Array.isArray(tono) && tono.length > 0;
    }

    validateStep16() {
        const ubicacion = this.formData.ubicacion_geografica || [];
        return Array.isArray(ubicacion) && ubicacion.length > 0;
    }

    validateStep18() {
        return !!this.formData.experiencia_previa;
    }

    validateStep19() {
        const metricas = this.formData.metricas_exito || [];
        return Array.isArray(metricas) && metricas.length > 0;
    }

    validateStep24() {
        return !!this.formData.industria;
    }

    initImageUpload() {
        const uploadSlots = document.querySelectorAll('.upload-slot');
        
        uploadSlots.forEach(slot => {
            const slotNumber = slot.dataset.slot;
            const fileInput = slot.querySelector(`#imagen_${slotNumber}`);
            const placeholder = slot.querySelector('.upload-placeholder');
            const preview = slot.querySelector('.upload-preview');
            const removeBtn = slot.querySelector('.remove-image');
            
            // Click to upload
            placeholder.addEventListener('click', () => {
                fileInput.click();
            });
            
            // File change handler
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleImageUpload(file, slot, slotNumber);
                }
            });
            
            // Remove image
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeImage(slotNumber, slot);
            });
            
            // Drag and drop
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('drag-over');
            });
            
            slot.addEventListener('dragleave', () => {
                slot.classList.remove('drag-over');
            });
            
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    this.handleImageUpload(file, slot, slotNumber);
                }
            });
        });
    }

    handleImageUpload(file, slot, slotNumber) {
        // Validate file
        if (!file.type.startsWith('image/')) {
            this.showError('Por favor selecciona un archivo de imagen válido.');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB
            this.showError('La imagen no puede ser mayor a 5MB.');
            return;
        }
        
        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const placeholder = slot.querySelector('.upload-placeholder');
            const preview = slot.querySelector('.upload-preview');
            const img = preview.querySelector('img');
            
            img.src = e.target.result;
            placeholder.style.display = 'none';
            preview.style.display = 'block';
            slot.classList.add('has-image');
            
            // Store file data
            const imageData = {
                slot: slotNumber,
                file: file,
                url: e.target.result,
                name: file.name,
                size: file.size
            };
            
            // Remove existing image in this slot if any
            this.uploadedImages = this.uploadedImages.filter(img => img.slot !== slotNumber);
            
            // Add new image
            this.uploadedImages.push(imageData);
            
            // Update form data
            this.formData.imagenes_producto = this.uploadedImages;
            
            this.validateCurrentStep();
            console.log('Images uploaded:', this.uploadedImages.length);
        };
        
        reader.readAsDataURL(file);
    }

    removeImage(slotNumber, slot) {
        const placeholder = slot.querySelector('.upload-placeholder');
        const preview = slot.querySelector('.upload-preview');
        const fileInput = slot.querySelector('input[type="file"]');
        
        // Reset UI
        placeholder.style.display = 'flex';
        preview.style.display = 'none';
        slot.classList.remove('has-image');
        fileInput.value = '';
        
        // Remove from data
        this.uploadedImages = this.uploadedImages.filter(img => img.slot !== slotNumber);
        this.formData.imagenes_producto = this.uploadedImages;
        
        this.validateCurrentStep();
        console.log('Image removed. Remaining:', this.uploadedImages.length);
    }

    updateCharCounter(textarea) {
        const charCount = textarea.value.length;
        const maxLength = textarea.getAttribute('maxlength') || 1000;
        const counter = document.getElementById('charCount');
        
        if (counter) {
            counter.textContent = charCount;
            
            // Update counter color based on usage
            counter.parentElement.classList.remove('warning', 'danger');
            if (charCount > maxLength * 0.8) {
                counter.parentElement.classList.add('warning');
            }
            if (charCount > maxLength * 0.95) {
                counter.parentElement.classList.add('danger');
            }
        }
    }

    updateNextButton(forceState = null) {
        const btnNext = document.getElementById('btnNext');
        let isValid = forceState !== null ? forceState : this.validateCurrentStep();

        btnNext.disabled = !isValid;
        
        if (isValid) {
            btnNext.style.opacity = '1';
            btnNext.style.transform = 'scale(1)';
        } else {
            btnNext.style.opacity = '0.5';
        }
    }

    nextStep() {
        if (this.isTransitioning || this.currentStep >= this.totalSteps) return;

        this.isTransitioning = true;
        this.currentStep++;
        this.transitionToStep('next');
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
        currentSlide.style.transform = direction === 'next' ? 'translateX(-50px)' : 'translateX(50px)';
        currentSlide.style.opacity = '0';

        setTimeout(() => {
            // Hide current slide
            currentSlide.classList.remove('active');
            currentSlide.style.transform = '';
            currentSlide.style.opacity = '';

            // Show next slide
            nextSlide.style.transform = direction === 'next' ? 'translateX(50px)' : 'translateX(-50px)';
            nextSlide.style.opacity = '0';
            nextSlide.classList.add('active');

            // Animate in next slide
            setTimeout(() => {
                nextSlide.style.transform = 'translateX(0)';
                nextSlide.style.opacity = '1';

                // Focus first input if exists
                const firstInput = nextSlide.querySelector('input[type="text"], input[type="email"], textarea');
                if (firstInput) {
                    setTimeout(() => firstInput.focus(), 300);
                }

                this.isTransitioning = false;
                this.updateProgress();
                this.updateNavigationButtons();
                this.updateNextButton();
            }, 50);
        }, 300);
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const currentStepEl = document.getElementById('currentStep');
        const totalStepsEl = document.getElementById('totalSteps');
        const timeEstimate = document.getElementById('timeEstimate');

        const progress = (this.currentStep / this.totalSteps) * 100;
        
        progressFill.style.width = `${progress}%`;
        currentStepEl.textContent = this.currentStep;
        totalStepsEl.textContent = this.totalSteps;

        // Update time estimate
        const remainingSteps = this.totalSteps - this.currentStep;
        const estimatedTime = Math.max(1, Math.ceil(remainingSteps * 0.2));
        timeEstimate.textContent = `${estimatedTime} min restantes`;
    }

    updateNavigationButtons() {
        const btnBack = document.getElementById('btnBack');
        const btnNext = document.getElementById('btnNext');

        // Back button
        btnBack.disabled = this.currentStep <= 1;

        // Next button text
        if (this.currentStep === this.totalSteps) {
            btnNext.innerHTML = `
                Completar Setup
                <i class="fas fa-check"></i>
            `;
        } else {
            btnNext.innerHTML = `
                Continuar
                <i class="fas fa-arrow-right"></i>
            `;
        }
    }

    initializeFirstQuestion() {
        const firstSlide = document.querySelector('.question-slide[data-step="1"]');
        if (firstSlide) {
            firstSlide.classList.add('active');
            
            // Focus first input
            setTimeout(() => {
                const firstInput = firstSlide.querySelector('input');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 500);
        }
        
        this.updateNavigationButtons();
        this.updateNextButton();
    }

    addRipple(element) {
        const ripple = document.createElement('div');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: 50%;
            top: 50%;
            background: rgba(253, 98, 79, 0.4);
            border-radius: 50%;
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.8s ease-out;
            pointer-events: none;
            z-index: 10;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.remove();
            }
        }, 800);
    }

    showError(message) {
        // Simple error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: var(--error-color);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 10001;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    skipToEnd() {
        // Implementation for skipping to end
        console.log('Skipping to end with current data:', this.formData);
        this.completeOnboarding(true);
    }

    completeOnboarding(skipped = false) {
        if (skipped) {
            console.log('Onboarding skipped:', this.formData);
            window.location.href = 'dashboard.html';
            return;
        }

        // Show success screen
        this.showStep('success');
        this.hideNavigation();

        // Handle dashboard button
        const dashboardBtn = document.getElementById('btnGoToDashboard');
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                console.log('Onboarding completed:', {
                    formData: this.formData,
                    uploadedImages: this.uploadedImages
                });
                // In real implementation, send data to backend
                window.location.href = 'dashboard.html';
            });
        }
    }

    hideNavigation() {
        const navButtons = document.querySelector('.navigation-buttons');
        const skipSection = document.querySelector('.skip-section');
        
        if (navButtons) navButtons.style.display = 'none';
        if (skipSection) skipSection.style.display = 'none';
    }

    showStep(stepId) {
        // Hide all slides
        const slides = document.querySelectorAll('.question-slide');
        slides.forEach(slide => {
            slide.style.display = 'none';
            slide.classList.remove('active');
        });

        // Show target slide
        const targetSlide = document.querySelector(`[data-step="${stepId}"]`);
        if (targetSlide) {
            targetSlide.style.display = 'flex';
            targetSlide.classList.add('active');
        }
    }
}

// Add animation styles
if (!document.getElementById('complete-onboarding-animations')) {
    const style = document.createElement('style');
    style.id = 'complete-onboarding-animations';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: translate(-50%, -50%) scale(2);
                opacity: 0;
            }
        }
        
        .upload-slot.drag-over {
            border-color: var(--primary-color);
            background: rgba(253, 98, 79, 0.1);
            transform: scale(1.02);
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    new CompleteOnboardingForm();
});