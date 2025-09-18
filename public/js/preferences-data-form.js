// ===== FORMULARIO DE PREFERENCIAS DE UGC =====

class PreferencesDataForm {
    constructor() {
        this.form = document.getElementById('preferencesDataForm');
        this.currentStep = 4;
        this.totalSteps = 4;
        this.preferencesData = {};
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSavedData();
        this.setupValidation();
        this.setupAdvancedValidation();
        this.setupContextIntegration();
    }

    bindEvents() {
        // Envío del formulario
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Validación en tiempo real
        const inputs = this.form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });

        // Cambios en selects que afectan otros campos
        this.setupConditionalFields();
    }

    setupValidation() {
        // Reglas de validación
        this.validationRules = {
            plataforma_principal: {
                required: true,
                message: 'Selecciona la plataforma principal'
            },
            tipo_avatar: {
                required: true,
                message: 'Selecciona el tipo de avatar'
            },
            tono_copy: {
                required: true,
                message: 'Selecciona el tono del copy'
            },
            mensaje_clave: {
                minLength: 10,
                message: 'El mensaje clave debe tener al menos 10 caracteres'
            }
        };
    }

    setupConditionalFields() {
        // Mostrar/ocultar campos según selecciones
        const plataformaPrincipal = document.getElementById('plataforma_principal');
        const incluirHashtags = document.getElementById('incluir_hashtags');

        if (plataformaPrincipal) {
            plataformaPrincipal.addEventListener('change', () => {
                this.updatePlatformFields();
            });
        }

        if (incluirHashtags) {
            incluirHashtags.addEventListener('change', () => {
                this.updateHashtagFields();
            });
        }
    }


    updatePlatformFields() {
        const plataforma = document.getElementById('plataforma_principal').value;
        const aspectRatioField = document.getElementById('aspect_ratio');
        
        if (plataforma === 'instagram' || plataforma === 'tiktok' || plataforma === 'youtube') {
            if (!aspectRatioField) {
                this.createAspectRatioField();
            }
        } else {
            if (aspectRatioField) {
                aspectRatioField.parentNode.remove();
            }
        }
    }

    updateHashtagFields() {
        const incluirHashtags = document.getElementById('incluir_hashtags').value;
        const hashtagsField = document.getElementById('hashtags_personalizados');
        
        if (incluirHashtags === 'si' || incluirHashtags === 'opcional') {
            if (!hashtagsField) {
                this.createHashtagsField();
            }
        } else {
            if (hashtagsField) {
                hashtagsField.parentNode.remove();
            }
        }
    }



    createAspectRatioField() {
        const container = document.querySelector('.form-grid');
        const aspectRatioDiv = document.createElement('div');
        aspectRatioDiv.className = 'form-group';
        aspectRatioDiv.innerHTML = `
            <label for="aspect_ratio" class="form-label">Relación de Aspecto</label>
            <select id="aspect_ratio" name="aspect_ratio" class="form-select">
                <option value="1:1">1:1 (Cuadrado)</option>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Vertical)</option>
                <option value="4:5">4:5 (Instagram Post)</option>
                <option value="1.91:1">1.91:1 (Facebook)</option>
            </select>
            <span class="form-hint">Formato recomendado para la plataforma</span>
        `;
        container.appendChild(aspectRatioDiv);
    }

    createHashtagsField() {
        const container = document.querySelector('.form-grid');
        const hashtagsDiv = document.createElement('div');
        hashtagsDiv.className = 'form-group full-width';
        hashtagsDiv.innerHTML = `
            <label for="hashtags_personalizados" class="form-label">Hashtags Personalizados</label>
            <textarea id="hashtags_personalizados" name="hashtags_personalizados" class="form-textarea" rows="2" placeholder="#hashtag1 #hashtag2 #hashtag3"></textarea>
            <span class="form-hint">Hashtags específicos que quieres incluir (separados por espacios)</span>
        `;
        container.appendChild(hashtagsDiv);
    }

    validateField(field) {
        const fieldName = field.name;
        const value = field.value.trim();
        const rules = this.validationRules[fieldName];

        if (!rules) return true;

        // Limpiar errores previos
        this.clearFieldError(field);

        // Validar campo requerido
        if (rules.required && !value) {
            this.showFieldError(field, 'Este campo es obligatorio');
            return false;
        }

        // Validar longitud mínima
        if (rules.minLength && value.length < rules.minLength) {
            this.showFieldError(field, rules.message);
            return false;
        }

        // Validar patrón
        if (rules.pattern && value && !rules.pattern.test(value)) {
            this.showFieldError(field, rules.message);
            return false;
        }

        // Marcar como válido
        this.showFieldSuccess(field);
        return true;
    }

    showFieldError(field, message) {
        field.classList.add('error');
        field.classList.remove('success');
        
        // Remover mensaje de error anterior
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Agregar nuevo mensaje de error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    showFieldSuccess(field) {
        field.classList.remove('error');
        field.classList.add('success');
        
        // Remover mensaje de error si existe
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorMessage = field.parentNode.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    collectFormData() {
        const formData = new FormData(this.form);
        const preferencesData = {};

        // Recopilar datos del formulario
        for (let [key, value] of formData.entries()) {
            if (key === 'estilo_contenido' || key === 'tipos_escenarios') {
                // Manejar arrays de checkboxes
                if (!preferencesData[key]) {
                    preferencesData[key] = [];
                }
                preferencesData[key].push(value);
            } else if (key === 'notificar_generacion' || key === 'notificar_errores' || key === 'notificar_actualizaciones') {
                // Manejar checkboxes de notificaciones
                preferencesData[key] = true;
            } else {
                preferencesData[key] = value;
            }
        }

        // Agregar campos adicionales requeridos por Supabase
        preferencesData.user_id = this.getUserId();
        preferencesData.activo = true;
        preferencesData.creado_en = new Date().toISOString();
        preferencesData.actualizado_en = new Date().toISOString();

        // Procesar configuraciones específicas
        this.processSpecificConfigurations(preferencesData);

        return preferencesData;
    }

    processSpecificConfigurations(preferencesData) {
        // Limpiar datos para enviar solo las columnas que existen en la tabla
        const cleanData = {};
        
        // Campos básicos que existen en la tabla
        const allowedFields = [
            'plataforma_principal',
            'estilo_contenido',
            'filtros_preferidos',
            'iluminacion',
            'tipo_avatar',
            'genero_avatar',
            'edad_avatar',
            'etnia_avatar',
            'caracteristicas_avatar',
            'tipos_escenarios',
            'estilo_escenario',
            'hora_dia',
            'tono_copy',
            'longitud_texto',
            'idioma_contenido',
            'incluir_hashtags',
            'mensaje_clave',
            'call_to_action',
            'aspect_ratio',
            'user_id',
            'activo',
            'creado_en',
            'actualizado_en'
        ];
        
        // Solo incluir campos que existen en la tabla
        allowedFields.forEach(field => {
            if (preferencesData[field] !== undefined) {
                cleanData[field] = preferencesData[field];
            }
        });
        
        // Limpiar el objeto original y reemplazarlo con datos limpios
        Object.keys(preferencesData).forEach(key => {
            delete preferencesData[key];
        });
        
        Object.assign(preferencesData, cleanData);
        
        console.log('🧹 Datos limpiados para Supabase:', preferencesData);
    }

    getUserId() {
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        return savedData.user?.user_id || 'temp_user_' + Date.now();
    }

    setupAdvancedValidation() {
        // Configurar validación avanzada si está disponible
        if (window.validationManager) {
            window.validationManager.setupRealTimeValidation(this.form, 'preferences');
        }
    }

    setupContextIntegration() {
        // Integrar con el sistema de contexto
        if (window.contextManager) {
            // Escuchar cambios en el contexto
            window.contextManager.on('dataChanged', (event) => {
                if (event.detail.type === 'preferences') {
                    this.populateForm(event.detail.data);
                }
            });
        }
    }

    validateForm() {
        // Usar sistema de validación avanzado si está disponible
        if (window.validationManager) {
            const result = window.validationManager.validateUgcPreferences(this.form);
            if (!result.isValid) {
                this.showValidationErrors(result.errors);
                return false;
            }
            return true;
        }

        // Fallback a validación básica
        let isValid = true;
        const requiredFields = this.form.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Validar que al menos un estilo de contenido esté seleccionado
        const estilosContenido = this.form.querySelectorAll('input[name="estilo_contenido"]:checked');
        if (estilosContenido.length === 0) {
            this.showNotification('Selecciona al menos un estilo de contenido', 'error');
            isValid = false;
        } else {
            // Limpiar notificación de error si hay estilos seleccionados
            this.clearStyleError();
        }

        // Validar que al menos un tipo de escenario esté seleccionado
        const tiposEscenarios = this.form.querySelectorAll('input[name="tipos_escenarios"]:checked');
        if (tiposEscenarios.length === 0) {
            this.showNotification('Selecciona al menos un tipo de escenario', 'error');
            isValid = false;
        }

        return isValid;
    }

    showValidationErrors(errors) {
        errors.forEach(error => {
            const field = this.form.querySelector(`[name="${error.field}"]`);
            if (field) {
                this.showFieldError(field, error.message);
            } else {
                this.showNotification(error.message, 'error');
            }
        });
    }

    async handleSubmit() {
        console.log('🚀 Iniciando envío de formulario de preferencias');
        
        // Validar formulario
        if (!this.validateForm()) {
            console.log('❌ Validación falló');
            this.showNotification('Por favor, corrige los errores en el formulario', 'error');
            return;
        }

        console.log('✅ Validación exitosa');

        // Mostrar loading
        const submitBtn = this.form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';
        submitBtn.disabled = true;

        try {
            // Recopilar datos
            const preferencesData = this.collectFormData();
            console.log('📊 Datos recopilados:', preferencesData);
            
            // Guardar en contexto global
            if (window.contextManager) {
                window.contextManager.setData('preferences', preferencesData);
                console.log('💾 Datos guardados en contexto global');
            }
            
            // Guardar en localStorage temporalmente
            this.saveToLocalStorage(preferencesData);
            console.log('💾 Datos guardados en localStorage');
            
            // Enviar a Supabase
            console.log('🔄 Enviando a Supabase...');
            await this.submitToSupabase(preferencesData);
            console.log('✅ Datos enviados a Supabase exitosamente');
            
            // Marcar paso como completo
            if (window.navigationManager) {
                window.navigationManager.markStepComplete('preferences');
                console.log('✅ Paso marcado como completo');
            }
            
            // Mostrar éxito y redirigir
            this.showNotification('¡Configuración completada exitosamente!', 'success');
            
            // Redirigir al siguiente paso
            console.log('🔄 Redirigiendo al siguiente paso...');
            setTimeout(() => {
                console.log('🚀 Ejecutando redirección...');
                if (window.navigationManager) {
                    console.log('🧭 Usando NavigationManager');
                    window.navigationManager.navigateNext();
                } else {
                    console.log('🧭 Usando redirección directa');
                    window.location.href = 'datos-productos.html';
                }
            }, 2000);

        } catch (error) {
            console.error('❌ Error al guardar preferencias:', error);
            this.showNotification('Error al guardar la configuración. Inténtalo de nuevo.', 'error');
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async submitToSupabase(preferencesData) {
        try {
            // Usar la API de Supabase
            const result = await window.supabaseAPI.createUgcPreferences(preferencesData);
            
            if (!result.success) {
                throw new Error(result.message);
            }
            
            return {
                success: true,
                data: result.data,
                message: result.message
            };
        } catch (error) {
            throw new Error(error.message || 'Error de conexión con la base de datos');
        }
    }

    saveToLocalStorage(preferencesData) {
        // Guardar datos temporalmente en localStorage
        const existingData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        existingData.preferences = preferencesData;
        localStorage.setItem('ugc_studio_data', JSON.stringify(existingData));
    }

    loadSavedData() {
        // Cargar datos guardados si existen
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        if (savedData.preferences) {
            this.populateForm(savedData.preferences);
        }
    }

    populateForm(preferencesData) {
        // Llenar formulario con datos guardados
        Object.keys(preferencesData).forEach(key => {
            if (key === 'estilo_contenido' || key === 'tipos_escenarios') {
                // Manejar arrays de checkboxes
                if (Array.isArray(preferencesData[key])) {
                    preferencesData[key].forEach(value => {
                        const checkbox = this.form.querySelector(`input[name="${key}"][value="${value}"]`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                }
            } else if (key === 'notificar_generacion' || key === 'notificar_errores' || key === 'notificar_actualizaciones') {
                // Manejar checkboxes de notificaciones
                const checkbox = this.form.querySelector(`input[name="${key}"]`);
                if (checkbox) {
                    checkbox.checked = preferencesData[key];
                }
            } else {
                const field = this.form.querySelector(`[name="${key}"]`);
                if (field) {
                    field.value = preferencesData[key];
                }
            }
        });

        // Actualizar campos condicionales
        this.updateConditionalFields();
    }

    updateConditionalFields() {
        this.updatePlatformFields();
        this.updateHashtagFields();
    }

    clearStyleError() {
        // Remover notificaciones de error de estilos
        const existingNotifications = document.querySelectorAll('.notification-error');
        existingNotifications.forEach(notification => {
            if (notification.textContent.includes('estilo de contenido')) {
                notification.remove();
            }
        });
    }

    showNotification(message, type = 'info') {
        // Remover notificaciones existentes del mismo tipo
        const existingNotifications = document.querySelectorAll(`.notification-${type}`);
        existingNotifications.forEach(notification => {
            if (notification.textContent.includes(message)) {
                notification.remove();
            }
        });

        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Remover después de 4 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new PreferencesDataForm();
});

// Agregar estilos adicionales
const preferencesStyle = document.createElement('style');
preferencesStyle.textContent = `
    .style-grid,
    .scenario-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 0.75rem;
    }
    
    .btn-large {
        padding: 1rem 2rem;
        font-size: 1.1rem;
        font-weight: 600;
    }
    
    .btn-large i {
        font-size: 1.2rem;
    }
    
    .form-group.full-width {
        grid-column: 1 / -1;
    }
    
    .conditional-field {
        animation: fadeIn 0.3s ease-in;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .form-section:last-of-type {
        border-bottom: none;
        margin-bottom: 0;
    }
    
    .form-actions {
        background: var(--secondary-bg);
        margin: 2rem -2.5rem -2.5rem -2.5rem;
        padding: 2rem 2.5rem;
        border-radius: 0 0 16px 16px;
        border-top: 1px solid var(--border-color);
    }
`;
document.head.appendChild(preferencesStyle);
