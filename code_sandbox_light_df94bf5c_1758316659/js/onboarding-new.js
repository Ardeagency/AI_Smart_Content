// New Onboarding JavaScript - Complete UGC Setup

class NewOnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 33;
        this.formData = {
            // Sección 1: Perfil de usuario
            pais_usuario: '',
            idioma_preferido: '',
            plan_deseado: '',
            
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
        this.initializeFirstStep();
        this.initializeUploads();
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
            'palabras_usar', 'palabras_evitar', 'reglas_creativas', 'descripcion_producto',
            'beneficio_1', 'beneficio_2', 'beneficio_3', 'diferenciacion', 'modo_uso',
            'ingredientes', 'precio_producto', 'variantes_producto', 'apariencia_fisica'
        ];

        textInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.formData[id] = e.target.value;
                    this.updateCharCounter(e.target);
                    this.validateCurrentStep();
                    
                    // Disparar evento de cambio de datos
                    document.dispatchEvent(new CustomEvent('onboarding:data_change', {
                        detail: {
                            field: id,
                            value: e.target.value,
                            step: this.currentStep,
                            isValid: this.validateField(id, e.target.value)
                        }
                    }));
                });

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && this.validateCurrentStep()) {
                        e.preventDefault();
                        this.nextStep();
                    }
                });
            }
        });

        // Currency select
        const currencySelect = document.getElementById('moneda');
        if (currencySelect) {
            currencySelect.addEventListener('change', (e) => {
                this.formData.moneda = e.target.value;
                this.validateCurrentStep();
            });
        }

        // Voice accent select
        const accentSelect = document.getElementById('acento_voz');
        if (accentSelect) {
            accentSelect.addEventListener('change', (e) => {
                this.formData.acento_voz = e.target.value;
                this.updateVoiceCharacteristics();
                this.validateCurrentStep();
            });
        }
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

    getFieldNameForStep(step) {
        const stepMapping = {
            1: null, // nombre_completo removed
            2: 'pais_usuario',
            3: 'idioma_preferido',
            4: 'plan_deseado',
            5: 'nombre_marca',
            6: null, // Social links handled separately
            7: 'mercado_objetivo',
            8: 'idiomas_contenido',
            9: 'tono_voz',
            10: 'palabras_usar',
            11: 'palabras_evitar',
            12: 'reglas_creativas',
            13: null, // Logo upload
            14: null, // Brand files upload
            15: 'tipo_producto',
            16: 'descripcion_producto',
            17: null, // Benefits handled separately
            18: 'diferenciacion',
            19: 'modo_uso',
            20: 'ingredientes',
            21: 'precio_producto',
            22: 'variantes_producto',
            23: null, // Main product image
            24: null, // Product gallery
            25: 'tipo_creador',
            26: 'rango_edad',
            27: 'genero_avatar',
            28: 'apariencia_fisica',
            29: 'energia_avatar',
            30: 'idiomas_avatar',
            31: 'valores_avatar',
            32: null, // Voice characteristics handled separately
            33: null  // Avatar references
        };
        
        return stepMapping[step];
    }

    validateCurrentStep() {
        let isValid = false;
        
        switch(this.currentStep) {
            case 1:
                // Step 1 validation removed (nombre_completo)
                isValid = true;
                break;
            case 5:
                isValid = this.formData.nombre_marca.length >= 2;
                break;
            case 10:
                isValid = this.formData.palabras_usar.length >= 3;
                break;
            case 13:
                isValid = this.formData.logo_file !== null;
                break;
            case 16:
                isValid = this.formData.descripcion_producto.length >= 20;
                break;
            case 17:
                isValid = this.formData.beneficio_1.length >= 3 && 
                         this.formData.beneficio_2.length >= 3 && 
                         this.formData.beneficio_3.length >= 3;
                break;
            case 21:
                isValid = this.formData.precio_producto && parseFloat(this.formData.precio_producto) > 0;
                break;
            case 23:
                // Validar que al menos 2 de las 4 imágenes estén subidas
                const uploadedImages = [
                    this.formData.imagen_producto_1,
                    this.formData.imagen_producto_2,
                    this.formData.imagen_producto_3,
                    this.formData.imagen_producto_4
                ].filter(img => img !== null);
                isValid = uploadedImages.length >= 2;
                break;
            case 28:
                isValid = this.formData.apariencia_fisica.length >= 10;
                break;
            case 30:
                isValid = this.formData.idiomas_avatar.length > 0;
                break;
            case 31:
                isValid = this.formData.valores_avatar.length > 0;
                break;
            case 32:
                isValid = this.formData.timbre_voz && this.formData.velocidad_voz;
                break;
            default:
                // For option-based steps, check if an option is selected
                const currentSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);
                const selected = currentSlide?.querySelector('.selected');
                const multiSelected = currentSlide?.querySelectorAll('.multi-select.selected');
                
                if (multiSelected && multiSelected.length > 0) {
                    isValid = true;
                } else if (selected) {
                    isValid = true;
                } else {
                    // Check if it's an optional step
                    const optionalSteps = [6, 11, 12, 14, 18, 19, 20, 22, 24, 33];
                    isValid = optionalSteps.includes(this.currentStep);
                }
        }

        this.updateNextButton(isValid);
        return isValid;
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
        if (this.isTransitioning || !this.validateCurrentStep()) return;

        if (this.currentStep >= this.totalSteps) {
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
                plan: this.formData.plan_deseado || 'pro',
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
                await OnboardingSupabaseIntegration.saveOnboardingDataToSupabase(this.formData, this.uploadedFiles);
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
                plan: this.formData.plan_deseado || 'pro',
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

document.addEventListener('DOMContentLoaded', function() {
    new NewOnboardingForm();
});