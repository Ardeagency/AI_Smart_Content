/**
 * AI Smart Content - Form Record
 * Formulario optimizado y simplificado para registro de datos
 */

class FormRecord {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 10;
        this.formData = {};
        this.supabase = null;
        this.userId = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateProgress();
        this.setupCharCounters();
        this.setupFileUploads();
        this.setupCustomMultiselects();
        
        // Inicializar Supabase
        await this.initSupabase();
    }

    async initSupabase() {
        if (typeof waitForSupabase === 'function') {
            this.supabase = await waitForSupabase(15000);
        } else if (window.supabaseClient) {
            this.supabase = window.supabaseClient;
        } else if (typeof initSupabase === 'function') {
            this.supabase = await initSupabase();
        }

        if (!this.supabase) {
            throw new Error('No se pudo inicializar Supabase. Por favor, recarga la página.');
        }

        const { data: { user }, error: userError } = await this.supabase.auth.getUser();
        
        if (userError) {
            throw new Error(`Error de autenticación: ${userError.message}`);
        }

        if (!user) {
            throw new Error('No hay usuario autenticado. Por favor, inicia sesión nuevamente.');
        }

        this.userId = user.id;
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
        // Logo upload (single file only)
        const logoUpload = document.getElementById('logoUpload');
        const logoInput = document.getElementById('logo_file');
        if (logoUpload && logoInput) {
            logoUpload.addEventListener('click', () => logoInput.click());
            logoInput.addEventListener('change', (e) => {
                // Ensure only one file
                if (e.target.files.length > 1) {
                    alert('Solo se puede subir un logo a la vez');
                    e.target.value = '';
                    return;
                }
                this.handleFileUpload(e, 'logo', 'logoPreview');
            });
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
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(previewId);
            if (preview) {
                // Check if this is logo preview (has inner div) or product image preview (direct)
                const innerDiv = preview.querySelector('div');
                const isLogoPreview = innerDiv !== null;
                
                if (isLogoPreview) {
                    // Logo preview structure
                    const img = preview.querySelector('img');
                    if (img) {
                        img.src = e.target.result;
                    } else {
                        const newImg = document.createElement('img');
                        newImg.src = e.target.result;
                        newImg.alt = 'Preview';
                        newImg.style.maxWidth = '100px';
                        newImg.style.maxHeight = '100px';
                        newImg.style.borderRadius = '8px';
                        innerDiv.prepend(newImg);
                    }
                    preview.style.display = 'block';
                } else {
                    // Product image preview structure (direct in preview div)
                    preview.innerHTML = ''; // Clear any existing content
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = 'Preview';
                    img.style.cssText = 'max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 0.5rem; display: block;';
                    
                    // Add remove button
                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn btn-secondary';
                    removeBtn.style.cssText = 'margin-top: 0.5rem; padding: 0.5rem 1rem; font-size: 0.85rem;';
                    removeBtn.innerHTML = '<i class="fas fa-times"></i> Eliminar';
                    
                    // Store reference to input and fieldName for removal
                    const input = event.target;
                    const fieldNameRef = fieldName;
                    removeBtn.onclick = () => {
                        input.value = '';
                        preview.innerHTML = '';
                        preview.style.display = 'none';
                        delete this.formData[fieldNameRef];
                    };
                    
                    preview.appendChild(img);
                    preview.appendChild(removeBtn);
                    preview.style.display = 'block';
                }
            }
            
            // Store file in formData for Supabase upload
            if (fieldName === 'logo') {
                this.formData.logo_file = [file];
            } else if (fieldName.startsWith('productImage')) {
                if (!this.formData.product_images) {
                    this.formData.product_images = [];
                }
                const index = parseInt(fieldName.replace('productImage', '')) - 1;
                this.formData.product_images[index] = file;
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

        // Store files for Supabase upload
        if (fieldName === 'archivos_identidad') {
            this.formData.archivos_identidad = files;
        } else {
            if (!this.formData[fieldName]) {
                this.formData[fieldName] = [];
            }
            this.formData[fieldName] = files;
        }
    }

    setupCustomMultiselects() {
        // Setup mercado objetivo with auto-select callback
        this.initCustomMultiselect('mercado_objetivo', 'mercado_objetivo', () => {
            // Auto-select languages when markets change
            const mercadoValues = this.getMultiselectValues('mercado_objetivo');
            if (mercadoValues.length > 0) {
                this.autoSelectLanguagesFromMarkets(mercadoValues);
            }
        });
        
        // Setup idiomas contenido
        this.initCustomMultiselect('idiomas_contenido', 'idiomas_contenido');

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
            if (!tipo || !tipo.value) {
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

        stepElement.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.type === 'file') return;
            
            if (field.type === 'hidden' && (field.id === 'mercado_objetivo' || field.id === 'idiomas_contenido' || field.id === 'palabras_evitar')) {
                try {
                    const value = field.value ? JSON.parse(field.value) : [];
                    this.formData[field.id] = Array.isArray(value) ? value : [];
                } catch (e) {
                    this.formData[field.id] = [];
                }
            } else if (field.multiple && field.tagName === 'SELECT') {
                this.formData[field.id] = Array.from(field.selectedOptions)
                    .filter(opt => opt.value !== '')
                    .map(opt => opt.value);
            } else if (field.tagName === 'SELECT' && !field.multiple) {
                this.formData[field.id] = field.value;
            } else if (field.type === 'hidden') {
                try {
                    this.formData[field.id] = JSON.parse(field.value);
                } catch {
                    this.formData[field.id] = field.value;
                }
            } else {
                const value = field.value.trim();
                if (value) {
                    this.formData[field.id] = value;
                }
            }
        });

        // Obtener valores de multiselects directamente
        if (step === 2) {
            const mercadoValues = this.getMultiselectValues('mercado_objetivo');
            const idiomasValues = this.getMultiselectValues('idiomas_contenido');
            if (mercadoValues && mercadoValues.length > 0) {
                this.formData.mercado_objetivo = mercadoValues;
            }
            if (idiomasValues && idiomasValues.length > 0) {
                this.formData.idiomas_contenido = idiomasValues;
            }
        }

        if (step === 3) {
            const palabrasEvitar = this.getMultiselectValues('palabras_evitar');
            if (palabrasEvitar && palabrasEvitar.length > 0) {
                this.formData.palabras_evitar = palabrasEvitar;
            }
            const tonoVoz = document.getElementById('tono_voz');
            if (tonoVoz && tonoVoz.value) {
                this.formData.tono_voz = tonoVoz.value;
            }
        }
    }

    async nextStep() {
        if (!this.validateStep(this.currentStep)) {
            return;
        }

        this.collectStepData(this.currentStep);

        if (this.currentStep < this.totalSteps - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
            this.updateProgress();
        } else if (this.currentStep === this.totalSteps - 1) {
            // Último paso antes de finalizar - guardar inmediatamente
            await this.completeForm();
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
            btnNext.textContent = step === this.totalSteps - 1 ? 'Finalizar y Guardar' : 'Continuar';
        }
    }

    updateProgress() {
        const progress = (this.currentStep / this.totalSteps) * 100;
        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('currentStep').textContent = this.currentStep;
        document.getElementById('totalSteps').textContent = this.totalSteps;
    }

    async completeForm() {
        const btnNext = document.getElementById('btnNext');
        
        // Recopilar todos los datos
        for (let i = 1; i <= this.totalSteps; i++) {
            this.collectStepData(i);
        }

        // Validar campos requeridos
        const requiredFields = {
            'nombre_marca': 'Nombre de la marca',
            'mercado_objetivo': 'Mercados objetivo',
            'idiomas_contenido': 'Idiomas de contenido',
            'tono_voz': 'Tono de voz',
            'tipo_producto': 'Tipo de producto',
            'nombre_producto': 'Nombre del producto',
            'descripcion_producto': 'Descripción del producto',
            'beneficio_1': 'Primer beneficio',
            'audiencia_desc': 'Descripción de audiencia',
            'objetivo_principal': 'Objetivo principal',
            'cta': 'Call to Action',
            'cta_url': 'URL del CTA'
        };

        const missingFields = [];
        for (const [field, label] of Object.entries(requiredFields)) {
            const value = this.formData[field];
            if (!value || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && value.trim() === '')) {
                missingFields.push(label);
            }
        }

        if (missingFields.length > 0) {
            alert(`Por favor completa los siguientes campos requeridos:\n\n${missingFields.join('\n')}`);
            return false;
        }

        // Estado de carga
        if (btnNext) {
            btnNext.disabled = true;
            btnNext.textContent = 'Guardando...';
        }

        try {
            // Verificar Supabase
            if (!this.supabase || !this.userId) {
                await this.initSupabase();
                if (!this.supabase || !this.userId) {
                    throw new Error('No se pudo inicializar Supabase o no hay usuario autenticado');
                }
            }

            // Guardar en Supabase
            await this.saveToSupabase();
            
            // Solo avanzar si el guardado fue exitoso
            this.currentStep = this.totalSteps;
            this.showStep(this.totalSteps);
            this.updateProgress();
            
            return true;
        } catch (error) {
            console.error('❌ Error al guardar:', error);
            console.error('Detalles del error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            
            let errorMessage = `Error al guardar los datos:\n\n${error.message || 'Error desconocido'}`;
            if (error.details) {
                errorMessage += `\n\nDetalles: ${error.details}`;
            }
            if (error.hint) {
                errorMessage += `\n\nSugerencia: ${error.hint}`;
            }
            errorMessage += `\n\nPor favor, revisa la consola para más detalles e intenta nuevamente.`;
            
            alert(errorMessage);
            
            // NO avanzar - reactivar botón
            if (btnNext) {
                btnNext.disabled = false;
                btnNext.textContent = 'Finalizar y Guardar';
            }
            
            return false;
        }
    }

    async saveToSupabase() {
        if (!this.supabase || !this.userId) {
            const errorMsg = 'Supabase no está inicializado o no hay usuario autenticado';
            console.error('❌ Error:', errorMsg);
            console.log('Supabase disponible:', !!this.supabase);
            console.log('UserId disponible:', !!this.userId);
            throw new Error(errorMsg);
        }

        // Log de datos antes de guardar para debugging
        console.log('📋 Datos a guardar:', {
            nombre_marca: this.formData.nombre_marca,
            mercado_objetivo: this.formData.mercado_objetivo,
            idiomas_contenido: this.formData.idiomas_contenido,
            tono_voz: this.formData.tono_voz,
            tipo_producto: this.formData.tipo_producto
        });


        // 1. Crear o actualizar proyecto
        // Asegurar que los arrays JSONB se envíen correctamente
        const mercadoObjetivo = Array.isArray(this.formData.mercado_objetivo) 
            ? this.formData.mercado_objetivo 
            : (this.formData.mercado_objetivo ? [this.formData.mercado_objetivo] : []);
        
        const idiomasContenido = Array.isArray(this.formData.idiomas_contenido) 
            ? this.formData.idiomas_contenido 
            : (this.formData.idiomas_contenido ? [this.formData.idiomas_contenido] : []);

        const projectData = {
            user_id: this.userId,
            nombre_marca: this.formData.nombre_marca || '',
            sitio_web: this.formData.sitio_web || null,
            instagram_url: this.formData.instagram_url || null,
            tiktok_url: this.formData.tiktok_url || null,
            logo_url: this.formData.logo_url || null,
            mercado_objetivo: mercadoObjetivo,
            idiomas_contenido: idiomasContenido
        };

        // Verificar si ya existe un proyecto para este usuario
        const { data: existingProject, error: checkError } = await this.supabase
            .from('projects')
            .select('id')
            .eq('user_id', this.userId)
            .maybeSingle(); // Usar maybeSingle para evitar error si no existe

        if (checkError && checkError.code !== 'PGRST116') {
            throw new Error(`Error al verificar proyecto: ${checkError.message}`);
        }

        let projectId;
        
        if (existingProject) {
            const { data: project, error: projectError } = await this.supabase
                .from('projects')
                .update(projectData)
                .eq('id', existingProject.id)
                .select()
                .single();

            if (projectError) {
                console.error('Error al actualizar proyecto:', projectError);
                console.error('Datos enviados:', JSON.stringify(projectData, null, 2));
                throw new Error(`Error al actualizar proyecto: ${projectError.message} (Código: ${projectError.code || 'N/A'})`);
            }
            projectId = project.id;
        } else {
            const { data: project, error: projectError } = await this.supabase
                .from('projects')
                .insert(projectData)
                .select()
                .single();

            if (projectError) {
                console.error('Error al crear proyecto:', projectError);
                console.error('Datos enviados:', JSON.stringify(projectData, null, 2));
                throw new Error(`Error al crear proyecto: ${projectError.message} (Código: ${projectError.code || 'N/A'})`);
            }
            projectId = project.id;
        }

        // 2. Subir logo si existe
        if (this.formData.logo_file && this.formData.logo_file.length > 0) {
            try {
                const logoFile = this.formData.logo_file[0];
                const fileExt = logoFile.name.split('.').pop();
                const fileName = `${projectId}/logo.${fileExt}`;

                // Intentar eliminar el logo anterior si existe
                try {
                    await this.supabase.storage
                        .from('brand-logos')
                        .remove([fileName]);
                } catch (removeError) {
                    // Ignorar error si el archivo no existe
                }

                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('brand-logos')
                    .upload(fileName, logoFile, {
                        upsert: true,
                        contentType: logoFile.type
                    });

                if (uploadError) {
                    console.warn('Error al subir logo:', uploadError);
                    // No lanzar error, continuar sin logo
                } else {
                    const { data: { publicUrl } } = this.supabase.storage
                        .from('brand-logos')
                        .getPublicUrl(fileName);

                    await this.supabase
                        .from('projects')
                        .update({ logo_url: publicUrl })
                        .eq('id', projectId);
                }
            } catch (logoError) {
                console.warn('Error al procesar logo:', logoError);
                // Continuar sin logo
            }
        }

        // 3. Crear o actualizar brand (lineamientos de marca)
        const palabrasEvitar = Array.isArray(this.formData.palabras_evitar) 
            ? this.formData.palabras_evitar 
            : (this.formData.palabras_evitar ? [this.formData.palabras_evitar] : []);

        const brandData = {
            project_id: projectId,
            tono_voz: this.formData.tono_voz || 'amigable',
            palabras_usar: this.formData.palabras_usar || null,
            palabras_evitar: palabrasEvitar,
            reglas_creativas: this.formData.reglas_creativas || null
        };

        const { data: existingBrand, error: checkBrandError } = await this.supabase
            .from('brands')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkBrandError && checkBrandError.code !== 'PGRST116') {
            throw new Error(`Error al verificar brand: ${checkBrandError.message}`);
        }

        if (existingBrand) {
            const { error: brandError } = await this.supabase
                .from('brands')
                .update(brandData)
                .eq('id', existingBrand.id);

            if (brandError) {
                throw new Error(`Error al actualizar brand: ${brandError.message}`);
            }
        } else {
            const { error: brandError } = await this.supabase
                .from('brands')
                .insert(brandData);

            if (brandError) {
                throw new Error(`Error al crear brand: ${brandError.message}`);
            }
        }

        // 4. Subir archivos de identidad si existen
        if (this.formData.archivos_identidad && this.formData.archivos_identidad.length > 0) {
            const uploadPromises = this.formData.archivos_identidad.map(async (file) => {
                try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${projectId}/${Date.now()}_${file.name}`;

                    const { data: uploadData, error: uploadError } = await this.supabase.storage
                        .from('brand-files')
                        .upload(fileName, file, {
                            contentType: file.type
                        });

                    if (uploadError) {
                        console.warn('Error al subir archivo:', file.name, uploadError);
                        return; // Continuar con el siguiente archivo
                    }

                    const { data: { publicUrl } } = this.supabase.storage
                        .from('brand-files')
                        .getPublicUrl(fileName);

                    const { error: insertError } = await this.supabase
                        .from('brand_files')
                        .insert({
                            project_id: projectId,
                            file_name: file.name,
                            file_url: publicUrl,
                            file_type: file.type,
                            file_size: file.size
                        });

                    if (insertError) {
                        console.warn('Error al insertar registro de archivo:', insertError);
                    }
                } catch (fileError) {
                    console.warn('Error al procesar archivo:', file.name, fileError);
                    // Continuar con el siguiente archivo
                }
            });

            await Promise.all(uploadPromises);
        }

        // 5. Crear producto
        const productData = {
            project_id: projectId,
            tipo_producto: this.formData.tipo_producto || 'otro',
            nombre_producto: this.formData.nombre_producto || '',
            descripcion_producto: this.formData.descripcion_producto || '',
            beneficio_1: this.formData.beneficio_1 || null,
            beneficio_2: this.formData.beneficio_2 || null,
            beneficio_3: this.formData.beneficio_3 || null,
            diferenciacion: this.formData.diferenciacion || null,
            modo_uso: this.formData.modo_uso || null,
            ingredientes: this.formData.ingredientes || null,
            precio_producto: this.formData.precio_producto ? parseFloat(this.formData.precio_producto) : null,
            moneda: this.formData.moneda || 'USD',
            variantes_producto: this.formData.variantes_producto || null
        };

        const { data: existingProduct, error: checkProductError } = await this.supabase
            .from('products')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkProductError && checkProductError.code !== 'PGRST116') {
            throw new Error(`Error al verificar producto: ${checkProductError.message}`);
        }

        let productId;

        if (existingProduct) {
            const { data: product, error: productError } = await this.supabase
                .from('products')
                .update(productData)
                .eq('id', existingProduct.id)
                .select()
                .single();

            if (productError) {
                throw new Error(`Error al actualizar producto: ${productError.message}`);
            }
            productId = product.id;
        } else {
            const { data: product, error: productError } = await this.supabase
                .from('products')
                .insert(productData)
                .select()
                .single();

            if (productError) {
                throw new Error(`Error al crear producto: ${productError.message}`);
            }
            productId = product.id;
        }

        // 6. Subir imágenes del producto
        if (this.formData.product_images && this.formData.product_images.length > 0) {
            // Filtrar archivos nulos
            const validImages = this.formData.product_images.filter(img => img !== null && img !== undefined);
            const imageUploadPromises = validImages.map(async (file, index) => {
                try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${productId}/${index + 1}_${Date.now()}.${fileExt}`;

                    const { data: uploadData, error: uploadError } = await this.supabase.storage
                        .from('product-images')
                        .upload(fileName, file, {
                            contentType: file.type
                        });

                    if (uploadError) {
                        console.warn('Error al subir imagen del producto:', file.name, uploadError);
                        return; // Continuar con la siguiente imagen
                    }

                    const { data: { publicUrl } } = this.supabase.storage
                        .from('product-images')
                        .getPublicUrl(fileName);

                    const { error: insertError } = await this.supabase
                        .from('product_images')
                        .insert({
                            product_id: productId,
                            image_url: publicUrl,
                            image_type: ['principal', 'secundaria', 'detalle', 'contexto'][index] || 'secundaria',
                            image_order: index
                        });

                    if (insertError) {
                        console.warn('Error al insertar registro de imagen:', insertError);
                    }
                } catch (imageError) {
                    console.warn('Error al procesar imagen del producto:', imageError);
                    // Continuar con la siguiente imagen
                }
            });

            await Promise.all(imageUploadPromises);
        }

        // 7. Crear campaña
        const campaignData = {
            project_id: projectId,
            oferta_desc: this.formData.oferta_desc || null,
            audiencia_desc: this.formData.audiencia_desc || '',
            intenciones: this.formData.intenciones || null,
            objetivo_principal: this.formData.objetivo_principal || '',
            cta: this.formData.cta || 'Ver más',
            cta_url: this.formData.cta_url || '#'
        };

        const { data: existingCampaign, error: checkCampaignError } = await this.supabase
            .from('campaigns')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkCampaignError && checkCampaignError.code !== 'PGRST116') {
            throw new Error(`Error al verificar campaña: ${checkCampaignError.message}`);
        }

        if (existingCampaign) {
            const { error: campaignError } = await this.supabase
                .from('campaigns')
                .update(campaignData)
                .eq('id', existingCampaign.id);

            if (campaignError) {
                throw new Error(`Error al actualizar campaña: ${campaignError.message}`);
            }
        } else {
            const { error: campaignError } = await this.supabase
                .from('campaigns')
                .insert(campaignData);

            if (campaignError) {
                throw new Error(`Error al crear campaña: ${campaignError.message}`);
            }
        }

        // Marcar el usuario como form_verified = true
        const { error: updateError } = await this.supabase
            .from('users')
            .update({ form_verified: true })
            .eq('id', this.userId);

        if (updateError) {
            throw new Error(`Error al marcar formulario como completado: ${updateError.message}`);
        }
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
let formRecordInstance;
document.addEventListener('DOMContentLoaded', () => {
    formRecordInstance = new FormRecord();
    window.formRecordInstance = formRecordInstance;
});

// Remove logo function
FormRecord.prototype.removeLogo = function() {
    const logoInput = document.getElementById('logo_file');
    const logoPreview = document.getElementById('logoPreview');
    if (logoInput) logoInput.value = '';
    if (logoPreview) logoPreview.style.display = 'none';
    delete this.formData.logo;
};

