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
        try {
            // Esperar a que Supabase esté listo
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }

            if (this.supabase) {
                // Obtener usuario actual
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    this.userId = user.id;
                }
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
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
        if (!stepElement) {
            console.warn(`⚠️ No se encontró el paso ${step}`);
            return;
        }

        console.log(`📝 Recopilando datos del paso ${step}...`);

        // Collect all form data from current step
        stepElement.querySelectorAll('input, textarea, select').forEach(field => {
            // Skip file inputs (they're handled in handleFileUpload)
            if (field.type === 'file') return;
            
            // Handle custom multiselect hidden inputs FIRST
            if (field.type === 'hidden' && (field.id === 'mercado_objetivo' || field.id === 'idiomas_contenido' || field.id === 'palabras_evitar')) {
                try {
                    const value = field.value ? JSON.parse(field.value) : [];
                    this.formData[field.id] = Array.isArray(value) ? value : [];
                    console.log(`  ✓ ${field.id}:`, this.formData[field.id]);
                } catch (e) {
                    console.warn(`  ⚠️ Error parseando ${field.id}:`, e);
                    this.formData[field.id] = [];
                }
            } else if (field.multiple && field.tagName === 'SELECT') {
                const selected = Array.from(field.selectedOptions)
                    .filter(opt => opt.value !== '') // Excluir opción vacía
                    .map(opt => opt.value);
                this.formData[field.id] = selected;
                console.log(`  ✓ ${field.id}:`, selected);
            } else if (field.tagName === 'SELECT' && !field.multiple) {
                // Single select
                this.formData[field.id] = field.value;
                if (field.value) console.log(`  ✓ ${field.id}:`, field.value);
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
                    console.log(`  ✓ ${field.id}:`, value);
                }
            }
        });

        // También obtener valores directamente de los multiselects usando getMultiselectValues
        if (step === 2) {
            const mercadoValues = this.getMultiselectValues('mercado_objetivo');
            const idiomasValues = this.getMultiselectValues('idiomas_contenido');
            if (mercadoValues && mercadoValues.length > 0) {
                this.formData.mercado_objetivo = mercadoValues;
                console.log('  ✓ mercado_objetivo (directo):', mercadoValues);
            }
            if (idiomasValues && idiomasValues.length > 0) {
                this.formData.idiomas_contenido = idiomasValues;
                console.log('  ✓ idiomas_contenido (directo):', idiomasValues);
            }
        }

        if (step === 3) {
            const palabrasEvitar = this.getMultiselectValues('palabras_evitar');
            if (palabrasEvitar && palabrasEvitar.length > 0) {
                this.formData.palabras_evitar = palabrasEvitar;
                console.log('  ✓ palabras_evitar (directo):', palabrasEvitar);
            }
        }
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

    async completeForm() {
        // Collect ALL steps data before saving
        console.log('🔄 Recopilando datos de todos los pasos...');
        for (let i = 1; i <= this.totalSteps; i++) {
            this.collectStepData(i);
        }

        // Log form data
        console.log('📊 Form data collected (completo):', JSON.stringify(this.formData, null, 2));
        console.log('👤 User ID:', this.userId);
        console.log('🔌 Supabase disponible:', !!this.supabase);

        // Verificar que tenemos los datos necesarios
        if (!this.formData.nombre_marca) {
            alert('Error: Falta el nombre de la marca. Por favor, completa el paso 1.');
            return;
        }

        // Show loading state
        const btnNext = document.getElementById('btnNext');
        if (btnNext) {
            btnNext.disabled = true;
            btnNext.textContent = 'Guardando...';
        }

        try {
            // Verificar que Supabase esté inicializado
            if (!this.supabase || !this.userId) {
                console.error('❌ Supabase no inicializado o sin usuario');
                console.log('Supabase:', this.supabase);
                console.log('UserId:', this.userId);
                
                // Intentar inicializar nuevamente
                await this.initSupabase();
                
                if (!this.supabase || !this.userId) {
                    const errorMsg = 'No se pudo inicializar Supabase o no hay usuario autenticado. Por favor, recarga la página e inicia sesión nuevamente.';
                    console.error('❌', errorMsg);
                    alert(errorMsg);
                    if (btnNext) {
                        btnNext.disabled = false;
                        btnNext.textContent = 'Finalizar';
                    }
                    return; // NO avanzar, quedarse en el formulario
                }
            }

            // Guardar datos en Supabase - NO avanzar hasta que se complete exitosamente
            console.log('🔄 Iniciando guardado en Supabase...');
            await this.saveToSupabase();
            console.log('✅ Guardado completado exitosamente');
            
            // Solo avanzar si el guardado fue exitoso
            this.showStep(this.totalSteps);
        } catch (error) {
            // Error detallado en consola
            console.error('❌ ============================================');
            console.error('❌ ERROR AL GUARDAR DATOS EN SUPABASE');
            console.error('❌ ============================================');
            console.error('❌ Mensaje:', error.message);
            console.error('❌ Código:', error.code);
            console.error('❌ Detalles:', error.details);
            console.error('❌ Hint:', error.hint);
            console.error('❌ Error completo:', JSON.stringify(error, null, 2));
            console.error('❌ ============================================');
            
            // Mostrar mensaje de error al usuario
            const errorMessage = `Error al guardar los datos en Supabase:\n\n${error.message || 'Error desconocido'}\n\nPor favor:\n1. Revisa la consola para más detalles\n2. Verifica tu conexión a internet\n3. Intenta nuevamente haciendo clic en "Finalizar"\n\nLos datos del formulario NO se han perdido y están listos para guardarse.`;
            alert(errorMessage);
            
            // NO avanzar - mantener el botón activo para reintentar
            if (btnNext) {
                btnNext.disabled = false;
                btnNext.textContent = 'Reintentar Guardado';
                btnNext.onclick = () => {
                    this.completeForm(); // Permitir reintentar
                };
            }
            
            // NO redirigir, NO avanzar, NO reiniciar - quedarse estático
            return;
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

        console.log('💾 Iniciando guardado en Supabase...');
        console.log('👤 User ID:', this.userId);
        console.log('📋 Datos del formulario recopilados:', JSON.stringify(this.formData, null, 2));

        // 1. Crear o actualizar proyecto
        const projectData = {
            user_id: this.userId,
            nombre_marca: this.formData.nombre_marca || '',
            sitio_web: this.formData.sitio_web || null,
            instagram_url: this.formData.instagram_url || null,
            tiktok_url: this.formData.tiktok_url || null,
            logo_url: this.formData.logo_url || null,
            mercado_objetivo: Array.isArray(this.formData.mercado_objetivo) ? this.formData.mercado_objetivo : [],
            idiomas_contenido: Array.isArray(this.formData.idiomas_contenido) ? this.formData.idiomas_contenido : []
        };
        
        // Verificar si ya existe un proyecto para este usuario
        console.log('🔍 Verificando si existe proyecto para el usuario...');
        const { data: existingProject, error: checkError } = await this.supabase
            .from('projects')
            .select('id')
            .eq('user_id', this.userId)
            .maybeSingle(); // Usar maybeSingle para evitar error si no existe

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('❌ Error verificando proyecto existente:', checkError);
            throw new Error(`Error al verificar proyecto: ${checkError.message}`);
        }

        let projectId;
        
        if (existingProject) {
            // Actualizar proyecto existente
            console.log('📝 Actualizando proyecto existente...', existingProject.id);
            const { data: project, error: projectError } = await this.supabase
                .from('projects')
                .update(projectData)
                .eq('id', existingProject.id)
                .select()
                .single();

            if (projectError) {
                console.error('❌ Error actualizando proyecto:', projectError);
                console.error('Detalles:', JSON.stringify(projectError, null, 2));
                throw new Error(`Error al actualizar proyecto: ${projectError.message || 'Error desconocido'}`);
            }
            projectId = project.id;
            console.log('✅ Proyecto actualizado con ID:', projectId);
        } else {
            // Crear nuevo proyecto
            console.log('📝 Creando nuevo proyecto...', projectData);
            const { data: project, error: projectError } = await this.supabase
                .from('projects')
                .insert(projectData)
                .select()
                .single();

            if (projectError) {
                console.error('❌ Error creando proyecto:', projectError);
                console.error('Detalles completos:', JSON.stringify(projectError, null, 2));
                console.error('Datos que se intentaron insertar:', JSON.stringify(projectData, null, 2));
                throw new Error(`Error al crear proyecto: ${projectError.message || 'Error desconocido'}. Código: ${projectError.code || 'N/A'}`);
            }
            projectId = project.id;
            console.log('✅ Proyecto creado con ID:', projectId);
        }

        // 2. Subir logo si existe
        if (this.formData.logo_file && this.formData.logo_file.length > 0) {
            const logoFile = this.formData.logo_file[0];
            const fileExt = logoFile.name.split('.').pop();
            const fileName = `${projectId}/logo.${fileExt}`;

            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('brand-logos')
                .upload(fileName, logoFile);

            if (!uploadError) {
                const { data: { publicUrl } } = this.supabase.storage
                    .from('brand-logos')
                    .getPublicUrl(fileName);

                await this.supabase
                    .from('projects')
                    .update({ logo_url: publicUrl })
                    .eq('id', projectId);
            }
        }

        // 3. Crear o actualizar brand (lineamientos de marca)
        const brandData = {
            project_id: projectId,
            tono_voz: this.formData.tono_voz || 'amigable',
            palabras_usar: this.formData.palabras_usar || null,
            palabras_evitar: Array.isArray(this.formData.palabras_evitar) ? this.formData.palabras_evitar : [],
            reglas_creativas: this.formData.reglas_creativas || null
        };

        // Verificar si ya existe un brand para este proyecto
        console.log('🔍 Verificando si existe brand para el proyecto...');
        const { data: existingBrand, error: checkBrandError } = await this.supabase
            .from('brands')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkBrandError && checkBrandError.code !== 'PGRST116') {
            console.error('❌ Error verificando brand existente:', checkBrandError);
            throw new Error(`Error al verificar brand: ${checkBrandError.message}`);
        }

        if (existingBrand) {
            console.log('🎨 Actualizando brand existente...', existingBrand.id);
            const { error: brandError } = await this.supabase
                .from('brands')
                .update(brandData)
                .eq('id', existingBrand.id);

            if (brandError) {
                console.error('❌ Error actualizando brand:', brandError);
                console.error('Detalles:', JSON.stringify(brandError, null, 2));
                throw new Error(`Error al actualizar brand: ${brandError.message || 'Error desconocido'}`);
            }
            console.log('✅ Brand actualizado exitosamente');
        } else {
            console.log('🎨 Creando nuevo brand...', brandData);
            const { error: brandError } = await this.supabase
                .from('brands')
                .insert(brandData);

            if (brandError) {
                console.error('❌ Error creando brand:', brandError);
                console.error('Detalles completos:', JSON.stringify(brandError, null, 2));
                console.error('Datos que se intentaron insertar:', JSON.stringify(brandData, null, 2));
                throw new Error(`Error al crear brand: ${brandError.message || 'Error desconocido'}. Código: ${brandError.code || 'N/A'}`);
            }
            console.log('✅ Brand creado exitosamente');
        }

        // 4. Subir archivos de identidad si existen
        if (this.formData.archivos_identidad && this.formData.archivos_identidad.length > 0) {
            const uploadPromises = this.formData.archivos_identidad.map(async (file) => {
                const fileExt = file.name.split('.').pop();
                const fileName = `${projectId}/${Date.now()}_${file.name}`;

                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('brand-files')
                    .upload(fileName, file);

                if (!uploadError) {
                    const { data: { publicUrl } } = this.supabase.storage
                        .from('brand-files')
                        .getPublicUrl(fileName);

                    await this.supabase
                        .from('brand_files')
                        .insert({
                            project_id: projectId,
                            file_name: file.name,
                            file_url: publicUrl,
                            file_type: file.type,
                            file_size: file.size
                        });
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

        // Verificar si ya existe un producto para este proyecto
        console.log('🔍 Verificando si existe producto para el proyecto...');
        const { data: existingProduct, error: checkProductError } = await this.supabase
            .from('products')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkProductError && checkProductError.code !== 'PGRST116') {
            console.error('❌ Error verificando producto existente:', checkProductError);
            throw new Error(`Error al verificar producto: ${checkProductError.message}`);
        }

        let productId;

        if (existingProduct) {
            console.log('📦 Actualizando producto existente...', existingProduct.id);
            const { data: product, error: productError } = await this.supabase
                .from('products')
                .update(productData)
                .eq('id', existingProduct.id)
                .select()
                .single();

            if (productError) {
                console.error('❌ Error actualizando producto:', productError);
                console.error('Detalles:', JSON.stringify(productError, null, 2));
                throw new Error(`Error al actualizar producto: ${productError.message || 'Error desconocido'}`);
            }
            productId = product.id;
            console.log('✅ Producto actualizado con ID:', productId);
        } else {
            console.log('📦 Creando nuevo producto...', productData);
            const { data: product, error: productError } = await this.supabase
                .from('products')
                .insert(productData)
                .select()
                .single();

            if (productError) {
                console.error('❌ Error creando producto:', productError);
                console.error('Detalles completos:', JSON.stringify(productError, null, 2));
                console.error('Datos que se intentaron insertar:', JSON.stringify(productData, null, 2));
                throw new Error(`Error al crear producto: ${productError.message || 'Error desconocido'}. Código: ${productError.code || 'N/A'}`);
            }
            productId = product.id;
            console.log('✅ Producto creado con ID:', productId);
        }

        // 6. Subir imágenes del producto
        if (this.formData.product_images && this.formData.product_images.length > 0) {
            // Filtrar archivos nulos
            const validImages = this.formData.product_images.filter(img => img !== null && img !== undefined);
            const imageUploadPromises = validImages.map(async (file, index) => {
                const fileExt = file.name.split('.').pop();
                const fileName = `${productId}/${index + 1}_${Date.now()}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('product-images')
                    .upload(fileName, file);

                if (!uploadError) {
                    const { data: { publicUrl } } = this.supabase.storage
                        .from('product-images')
                        .getPublicUrl(fileName);

                    await this.supabase
                        .from('product_images')
                        .insert({
                            product_id: productId,
                            image_url: publicUrl,
                            image_type: ['principal', 'secundaria', 'detalle', 'contexto'][index] || 'secundaria',
                            image_order: index
                        });
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

        // Verificar si ya existe una campaña para este proyecto
        console.log('🔍 Verificando si existe campaña para el proyecto...');
        const { data: existingCampaign, error: checkCampaignError } = await this.supabase
            .from('campaigns')
            .select('id')
            .eq('project_id', projectId)
            .maybeSingle();

        if (checkCampaignError && checkCampaignError.code !== 'PGRST116') {
            console.error('❌ Error verificando campaña existente:', checkCampaignError);
            throw new Error(`Error al verificar campaña: ${checkCampaignError.message}`);
        }

        if (existingCampaign) {
            console.log('📢 Actualizando campaña existente...', existingCampaign.id);
            const { error: campaignError } = await this.supabase
                .from('campaigns')
                .update(campaignData)
                .eq('id', existingCampaign.id);

            if (campaignError) {
                console.error('❌ Error actualizando campaña:', campaignError);
                console.error('Detalles:', JSON.stringify(campaignError, null, 2));
                throw new Error(`Error al actualizar campaña: ${campaignError.message || 'Error desconocido'}`);
            }
            console.log('✅ Campaña actualizada exitosamente');
        } else {
            console.log('📢 Creando nueva campaña...', campaignData);
            const { error: campaignError } = await this.supabase
                .from('campaigns')
                .insert(campaignData);

            if (campaignError) {
                console.error('❌ Error creando campaña:', campaignError);
                console.error('Detalles completos:', JSON.stringify(campaignError, null, 2));
                console.error('Datos que se intentaron insertar:', JSON.stringify(campaignData, null, 2));
                throw new Error(`Error al crear campaña: ${campaignError.message || 'Error desconocido'}. Código: ${campaignError.code || 'N/A'}`);
            }
            console.log('✅ Campaña creada exitosamente');
        }

        // 8. Marcar el usuario como form_verified = true
        console.log('✅ Marcando usuario como form_verified...');
        const { error: updateError } = await this.supabase
            .from('users')
            .update({ form_verified: true })
            .eq('id', this.userId);

        if (updateError) {
            console.error('❌ Error actualizando form_verified:', updateError);
            console.error('Detalles:', JSON.stringify(updateError, null, 2));
            throw new Error(`Error al marcar formulario como completado: ${updateError.message || 'Error desconocido'}`);
        }
        console.log('✅ Usuario marcado como form_verified = true');
        console.log('✅ ============================================');
        console.log('✅ TODOS LOS DATOS GUARDADOS EXITOSAMENTE');
        console.log('✅ ============================================');
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

