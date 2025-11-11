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
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('btnNext').addEventListener('click', () => this.nextStep());
        document.getElementById('btnBack').addEventListener('click', () => this.prevStep());

        // Option cards (single select)
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const container = e.currentTarget.closest('.form-group');
                container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                const hiddenInput = container.querySelector('input[type="hidden"]');
                if (hiddenInput) {
                    hiddenInput.value = e.currentTarget.dataset.value;
                }
            });
        });

        // Market and language selects with auto-selection logic
        const mercadoSelect = document.getElementById('mercado_objetivo');
        const idiomasSelect = document.getElementById('idiomas_contenido');
        
        if (mercadoSelect) {
            mercadoSelect.addEventListener('change', () => {
                this.autoSelectLanguages(mercadoSelect, idiomasSelect);
            });
        }

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

    autoSelectLanguages(mercadoSelect, idiomasSelect) {
        if (!mercadoSelect || !idiomasSelect) return;

        const selectedMarkets = Array.from(mercadoSelect.selectedOptions).map(opt => opt.value);
        const languageMap = {
            // Países hispanohablantes
            'mexico': 'español',
            'colombia': 'español',
            'argentina': 'español',
            'chile': 'español',
            'peru': 'español',
            'venezuela': 'español',
            'ecuador': 'español',
            'guatemala': 'español',
            'cuba': 'español',
            'bolivia': 'español',
            'republica_dominicana': 'español',
            'honduras': 'español',
            'paraguay': 'español',
            'nicaragua': 'español',
            'el_salvador': 'español',
            'costa_rica': 'español',
            'panama': 'español',
            'uruguay': 'español',
            'spain': 'español',
            'latam': 'español',
            // Países de habla inglesa
            'usa': 'ingles',
            'canada': 'ingles',
            'uk': 'ingles',
            'australia': 'ingles',
            'new_zealand': 'ingles',
            'ireland': 'ingles',
            // Países de habla portuguesa
            'brazil': 'portugues',
            'portugal': 'portugues',
            // Países de habla francesa
            'france': 'frances',
            'belgium': 'frances',
            'switzerland': 'frances',
            // Otros idiomas
            'italy': 'italiano',
            'germany': 'aleman',
            'netherlands': 'holandes',
            'poland': 'polaco',
            'russia': 'ruso',
            'china': 'chino',
            'japan': 'japones',
            'south_korea': 'coreano',
            'india': 'hindi',
            'south_africa': 'ingles'
        };

        // Obtener idiomas sugeridos basados en países seleccionados
        const suggestedLanguages = new Set();
        
        selectedMarkets.forEach(market => {
            if (languageMap[market]) {
                suggestedLanguages.add(languageMap[market]);
            }
        });

        // Si hay idiomas sugeridos y ninguno está seleccionado, seleccionarlos automáticamente
        if (suggestedLanguages.size > 0) {
            const currentSelected = Array.from(idiomasSelect.selectedOptions).map(opt => opt.value);
            
            // Solo auto-seleccionar si no hay idiomas ya seleccionados
            if (currentSelected.length === 0) {
                suggestedLanguages.forEach(lang => {
                    const option = Array.from(idiomasSelect.options).find(opt => opt.value === lang);
                    if (option) {
                        option.selected = true;
                    }
                });
            } else {
                // Si ya hay idiomas seleccionados, agregar los sugeridos si no están ya seleccionados
                suggestedLanguages.forEach(lang => {
                    if (!currentSelected.includes(lang)) {
                        const option = Array.from(idiomasSelect.options).find(opt => opt.value === lang);
                        if (option) {
                            option.selected = true;
                        }
                    }
                });
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
            const mercado = document.getElementById('mercado_objetivo');
            const idiomas = document.getElementById('idiomas_contenido');
            
            if (!mercado || mercado.selectedOptions.length === 0) {
                alert('Por favor selecciona al menos un mercado objetivo');
                isValid = false;
            }
            if (!idiomas || idiomas.selectedOptions.length === 0) {
                alert('Por favor selecciona al menos un idioma');
                isValid = false;
            }
        }

        if (step === 3) {
            const tono = document.getElementById('tono_voz');
            if (!tono.value) {
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
            
            // Handle multiple select
            if (field.multiple && field.tagName === 'SELECT') {
                this.formData[field.id] = Array.from(field.selectedOptions).map(opt => opt.value);
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

