/**
 * AI Smart Content - Form Record
 * Formulario optimizado y simplificado para registro de datos
 */

class FormRecord {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 10;
        this.formData = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.setupCharCounters();
        this.setupFileUploads();
        this.setupCustomMultiselects();
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('btnNext').addEventListener('click', () => this.nextStep());
        document.getElementById('btnBack').addEventListener('click', () => this.prevStep());

        // Tono de voz select (single select)
        const tonoVozSelect = document.getElementById('tono_voz');
        if (tonoVozSelect) {
            tonoVozSelect.addEventListener('change', () => {
                this.formData.tono_voz = tonoVozSelect.value;
            });
        }

        // Custom multiselects are handled in setupCustomMultiselects

        // Form validation on input
        document.querySelectorAll('.form-input, .form-textarea').forEach(input => {
            input.addEventListener('input', () => {
                if (input.hasAttribute('required')) {
                    this.validateField(input);
                }
            });
        });
    }

    setupCharCounters() {
        const counters = {
            'palabras_usar': 'palabras_usar_count',
            'palabras_evitar': 'palabras_evitar_count',
            'reglas_creativas': 'reglas_creativas_count',
            'descripcion_producto': 'descripcion_producto_count',
            'diferenciacion': 'diferenciacion_count',
            'modo_uso': 'modo_uso_count',
            'ingredientes': 'ingredientes_count',
            'variantes_producto': 'variantes_producto_count',
            'oferta_desc': 'oferta_desc_count',
            'audiencia_desc': 'audiencia_desc_count',
            'intenciones': 'intenciones_count',
            'objetivo_principal': 'objetivo_principal_count'
        };

        Object.entries(counters).forEach(([inputId, counterId]) => {
            const input = document.getElementById(inputId);
            const counter = document.getElementById(counterId);
            if (input && counter) {
                input.addEventListener('input', () => {
                    counter.textContent = input.value.length;
                });
            }
        });
    }

    setupFileUploads() {
        // Logo upload
        const logoUpload = document.getElementById('logoUpload');
        const logoInput = document.getElementById('logo_file');
        if (logoUpload && logoInput) {
            logoUpload.addEventListener('click', () => logoInput.click());
            logoInput.addEventListener('change', (e) => this.handleFileUpload(e, 'logo', 'logoPreview'));
        }

        // Brand files upload
        const brandFilesUpload = document.getElementById('brandFilesUpload');
        const brandFilesInput = document.getElementById('brand_files');
        if (brandFilesUpload && brandFilesInput) {
            brandFilesUpload.addEventListener('click', () => brandFilesInput.click());
            brandFilesInput.addEventListener('change', (e) => this.handleMultipleFiles(e, 'brandFiles'));
        }

        // Product images
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`imagen_producto_${i}`);
            const preview = document.getElementById(`preview${i}`);
            if (input && preview) {
                const uploadZone = input.closest('.upload-zone');
                if (uploadZone) {
                    uploadZone.addEventListener('click', () => input.click());
                    input.addEventListener('change', (e) => this.handleFileUpload(e, `productImage${i}`, `preview${i}`));
                }
            }
        }
    }

    handleFileUpload(event, fieldName, previewId) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. Máximo 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(previewId);
            if (preview) {
                const img = preview.querySelector('img') || document.createElement('img');
                img.src = e.target.result;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                if (!preview.querySelector('img')) {
                    preview.appendChild(img);
                }
                preview.style.display = 'block';
            }
            this.formData[fieldName] = file;
        };
        reader.readAsDataURL(file);
    }

    handleMultipleFiles(event, fieldName) {
        const files = Array.from(event.target.files);
        const list = document.getElementById('brandFilesList');
        if (!list) return;

        list.innerHTML = '';
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.style.cssText = 'padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;';
            fileItem.innerHTML = `
                <span style="color: var(--text-primary);">${file.name}</span>
                <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            list.appendChild(fileItem);
        });

        if (!this.formData[fieldName]) {
            this.formData[fieldName] = [];
        }
        this.formData[fieldName] = files;
    }

    setupCustomMultiselects() {
        // Setup mercado objetivo
        this.initCustomMultiselect('mercado_objetivo', 'mercado_objetivo');
        
        // Setup idiomas contenido
        this.initCustomMultiselect('idiomas_contenido', 'idiomas_contenido');
        
        // Setup mercado objetivo with auto-select callback
        const mercadoWrapper = document.getElementById('mercado_objetivo_wrapper');
        if (mercadoWrapper) {
            // Re-initialize mercado with callback
            this.initCustomMultiselect('mercado_objetivo', 'mercado_objetivo', () => {
                // Auto-select languages when markets change
                const mercadoValues = this.getMultiselectValues('mercado_objetivo');
                if (mercadoValues.length > 0) {
                    this.autoSelectLanguagesFromMarkets(mercadoValues);
                }
            });
        }

        // Setup palabras a evitar
        this.initCustomMultiselect('palabras_evitar', 'palabras_evitar');
    }

    initCustomMultiselect(wrapperId, hiddenInputId, onChangeCallback = null) {
        const wrapper = document.getElementById(wrapperId + '_wrapper');
        const trigger = document.getElementById(wrapperId + '_trigger');
        const valueDisplay = document.getElementById(wrapperId + '_value');
        const dropdown = document.getElementById(wrapperId + '_dropdown');
        const hiddenInput = document.getElementById(hiddenInputId);
        const options = dropdown.querySelectorAll('.multiselect-option');

        if (!wrapper || !trigger || !valueDisplay || !dropdown || !hiddenInput) return;

        let selectedValues = [];
        const optionLabels = {};

        // Store option labels
        options.forEach(option => {
            const value = option.dataset.value;
            optionLabels[value] = option.textContent.trim();
        });

        // Toggle dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            this.closeAllMultiselects();
            if (!isOpen) {
                dropdown.classList.add('open');
                trigger.classList.add('open');
            }
        });

        // Handle option clicks
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.dataset.value;
                const index = selectedValues.indexOf(value);
                
                if (index > -1) {
                    selectedValues.splice(index, 1);
                    option.classList.remove('selected');
                } else {
                    selectedValues.push(value);
                    option.classList.add('selected');
                }

                this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
                hiddenInput.value = JSON.stringify(selectedValues);
                
                if (onChangeCallback) {
                    onChangeCallback();
                }
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            }
        });

        // Initialize display
        this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
    }

    updateMultiselectDisplay(wrapperId, selectedValues, optionLabels) {
        const valueDisplay = document.getElementById(wrapperId + '_value');
        const trigger = document.getElementById(wrapperId + '_trigger');
        if (!valueDisplay || !trigger) return;

        if (selectedValues.length === 0) {
            valueDisplay.textContent = 'Seleccionar...';
            valueDisplay.classList.remove('has-selection');
            trigger.querySelector('.multiselect-tags')?.remove();
        } else {
            valueDisplay.classList.add('has-selection');
            
            // Remove existing tags
            const existingTags = trigger.querySelector('.multiselect-tags');
            if (existingTags) existingTags.remove();

            // Create tags container
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'multiselect-tags';

            selectedValues.forEach(value => {
                const tag = document.createElement('div');
                tag.className = 'multiselect-tag';
                tag.innerHTML = `
                    <span>${optionLabels[value] || value}</span>
                    <span class="multiselect-tag-remove" data-value="${value}">×</span>
                `;
                tagsContainer.appendChild(tag);

                // Remove tag on click
                tag.querySelector('.multiselect-tag-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = selectedValues.indexOf(value);
                    if (index > -1) {
                        selectedValues.splice(index, 1);
                        const option = document.querySelector(`[data-value="${value}"]`);
                        if (option) option.classList.remove('selected');
                        this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
                        const hiddenInput = document.getElementById(wrapperId.replace('_wrapper', ''));
                        if (hiddenInput) hiddenInput.value = JSON.stringify(selectedValues);
                    }
                });
            });

            valueDisplay.textContent = '';
            valueDisplay.appendChild(tagsContainer);
        }
    }

    closeAllMultiselects() {
        document.querySelectorAll('.multiselect-dropdown').forEach(dropdown => {
            dropdown.classList.remove('open');
        });
        document.querySelectorAll('.multiselect-trigger').forEach(trigger => {
            trigger.classList.remove('open');
        });
    }

    getMultiselectValues(wrapperId) {
        const hiddenInput = document.getElementById(wrapperId);
        if (!hiddenInput || !hiddenInput.value) return [];
        try {
            return JSON.parse(hiddenInput.value);
        } catch {
            return [];
        }
    }

    autoSelectLanguagesFromMarkets(mercadoValues) {
        const languageMap = {
            'mexico': 'español', 'colombia': 'español', 'argentina': 'español', 'chile': 'español',
            'peru': 'español', 'venezuela': 'español', 'ecuador': 'español', 'guatemala': 'español',
            'cuba': 'español', 'bolivia': 'español', 'republica_dominicana': 'español', 'honduras': 'español',
            'paraguay': 'español', 'nicaragua': 'español', 'el_salvador': 'español', 'costa_rica': 'español',
            'panama': 'español', 'uruguay': 'español', 'spain': 'español', 'latam': 'español',
            'usa': 'ingles', 'canada': 'ingles', 'uk': 'ingles', 'australia': 'ingles',
            'new_zealand': 'ingles', 'ireland': 'ingles', 'south_africa': 'ingles',
            'brazil': 'portugues', 'portugal': 'portugues',
            'france': 'frances', 'belgium': 'frances', 'switzerland': 'frances',
            'italy': 'italiano', 'germany': 'aleman', 'netherlands': 'holandes',
            'poland': 'polaco', 'russia': 'ruso', 'china': 'chino', 'japan': 'japones',
            'south_korea': 'coreano', 'india': 'hindi'
        };

        const suggestedLanguages = new Set();
        mercadoValues.forEach(market => {
            if (languageMap[market]) {
                suggestedLanguages.add(languageMap[market]);
            }
        });

        if (suggestedLanguages.size > 0) {
            const currentSelected = this.getMultiselectValues('idiomas_contenido');
            const newSelected = [...new Set([...currentSelected, ...Array.from(suggestedLanguages)])];
            
            // Update hidden input
            const hiddenInput = document.getElementById('idiomas_contenido');
            if (hiddenInput) {
                hiddenInput.value = JSON.stringify(newSelected);
            }

            // Update UI
            const dropdown = document.getElementById('idiomas_contenido_dropdown');
            if (dropdown) {
                suggestedLanguages.forEach(lang => {
                    const option = dropdown.querySelector(`[data-value="${lang}"]`);
                    if (option && !option.classList.contains('selected')) {
                        option.classList.add('selected');
                    }
                });
                
                // Get option labels and update display
                const optionLabels = {};
                dropdown.querySelectorAll('.multiselect-option').forEach(opt => {
                    optionLabels[opt.dataset.value] = opt.textContent.trim();
                });
                this.updateMultiselectDisplay('idiomas_contenido', newSelected, optionLabels);
            }
        }
    }


    validateField(field) {
        const value = field.value.trim();
        if (field.hasAttribute('required') && !value) {
            field.style.borderColor = 'var(--error-color)';
            return false;
        }
        field.style.borderColor = 'var(--border-color)';
        return true;
    }

    validateStep(step) {
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (!stepElement) return true;

        const requiredFields = stepElement.querySelectorAll('[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Special validations
        if (step === 2) {
            const mercadoValues = this.getMultiselectValues('mercado_objetivo');
            const idiomasValues = this.getMultiselectValues('idiomas_contenido');
            
            if (!mercadoValues || mercadoValues.length === 0) {
                alert('Por favor selecciona al menos un mercado objetivo');
                isValid = false;
            }
            if (!idiomasValues || idiomasValues.length === 0) {
                alert('Por favor selecciona al menos un idioma');
                isValid = false;
            }
        }

        if (step === 3) {
            const tono = document.getElementById('tono_voz');
            if (!tono || !tono.value) {
                alert('Por favor selecciona un tono de voz');
                isValid = false;
            }
        }

        if (step === 5) {
            const tipo = document.getElementById('tipo_producto');
            if (!tipo.value) {
                alert('Por favor selecciona un tipo de producto');
                isValid = false;
            }
        }

        if (step === 8) {
            const images = [1, 2, 3, 4].filter(i => {
                const input = document.getElementById(`imagen_producto_${i}`);
                return input && input.files.length > 0;
            });
            if (images.length < 2) {
                alert('Por favor sube al menos 2 imágenes del producto');
                isValid = false;
            }
        }

        return isValid;
    }

    collectStepData(step) {
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (!stepElement) return;

        // Collect all form data from current step
        stepElement.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.type === 'file') return;
            
            // Handle custom multiselect hidden inputs
            if (field.type === 'hidden' && (field.id === 'mercado_objetivo' || field.id === 'idiomas_contenido' || field.id === 'palabras_evitar')) {
                try {
                    this.formData[field.id] = JSON.parse(field.value || '[]');
                } catch {
                    this.formData[field.id] = [];
                }
            } else if (field.multiple && field.tagName === 'SELECT') {
                const selected = Array.from(field.selectedOptions)
                    .filter(opt => opt.value !== '') // Excluir opción vacía
                    .map(opt => opt.value);
                this.formData[field.id] = selected;
            } else if (field.tagName === 'SELECT' && !field.multiple) {
                // Single select
                this.formData[field.id] = field.value;
            } else if (field.type === 'hidden') {
                try {
                    this.formData[field.id] = JSON.parse(field.value);
                } catch {
                    this.formData[field.id] = field.value;
                }
            } else {
                this.formData[field.id] = field.value;
            }
        });
    }

    nextStep() {
        if (!this.validateStep(this.currentStep)) {
            return;
        }

        this.collectStepData(this.currentStep);

        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.showStep(this.currentStep);
            this.updateProgress();
        } else {
            this.completeForm();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.showStep(this.currentStep);
            this.updateProgress();
        }
    }

    showStep(step) {
        // Hide all steps
        document.querySelectorAll('.form-step').forEach(s => {
            s.classList.remove('active');
        });

        // Show current step
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (stepElement) {
            stepElement.classList.add('active');
        }

        // Update navigation buttons
        const btnBack = document.getElementById('btnBack');
        const btnNext = document.getElementById('btnNext');

        btnBack.disabled = step === 1;
        
        if (step === this.totalSteps) {
            btnNext.style.display = 'none';
            btnBack.style.display = 'none';
        } else {
            btnNext.style.display = 'inline-flex';
            btnNext.textContent = step === this.totalSteps - 1 ? 'Finalizar' : 'Continuar';
        }
    }

    updateProgress() {
        const progress = (this.currentStep / this.totalSteps) * 100;
        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('currentStep').textContent = this.currentStep;
        document.getElementById('totalSteps').textContent = this.totalSteps;
    }

    completeForm() {
        // Collect final step data
        this.collectStepData(this.currentStep);

        // Log form data (in production, send to server)
        console.log('Form data collected:', this.formData);

        // Show success screen
        this.showStep(this.totalSteps);

        // In production, send data to server here
        // await fetch('/api/save-form-data', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(this.formData)
        // });
    }
}

// Global function for removing logo
function removeLogo() {
    const logoInput = document.getElementById('logo_file');
    const logoPreview = document.getElementById('logoPreview');
    if (logoInput) logoInput.value = '';
    if (logoPreview) {
        logoPreview.style.display = 'none';
        logoPreview.querySelector('img').src = '';
    }
}

// Initialize form when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.formRecord = new FormRecord();
});

