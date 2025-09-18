// ===== SISTEMA DE VALIDACIÓN MEJORADO =====
// Validación robusta, manejo de errores y feedback en tiempo real

class ValidationManager {
    constructor() {
        this.rules = {};
        this.errors = new Map();
        this.warnings = new Map();
        this.validators = new Map();
        
        this.setupDefaultValidators();
        this.setupEventListeners();
    }

    // ===== CONFIGURACIÓN DE VALIDADORES =====
    setupDefaultValidators() {
        // Validador de email
        this.addValidator('email', (value) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return {
                valid: emailRegex.test(value),
                message: 'Ingresa un correo electrónico válido'
            };
        });

        // Validador de contraseña
        this.addValidator('password', (value) => {
            const minLength = 6;
            const hasUpperCase = /[A-Z]/.test(value);
            const hasLowerCase = /[a-z]/.test(value);
            const hasNumbers = /\d/.test(value);
            
            if (value.length < minLength) {
                return {
                    valid: false,
                    message: `La contraseña debe tener al menos ${minLength} caracteres`
                };
            }
            
            if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
                return {
                    valid: false,
                    message: 'La contraseña debe contener mayúsculas, minúsculas y números'
                };
            }
            
            return { valid: true };
        });

        // Validador de confirmación de contraseña
        this.addValidator('passwordConfirm', (value, originalPassword) => {
            return {
                valid: value === originalPassword,
                message: 'Las contraseñas no coinciden'
            };
        });

        // Validador de longitud mínima
        this.addValidator('minLength', (value, minLength) => {
            return {
                valid: value.length >= minLength,
                message: `Debe tener al menos ${minLength} caracteres`
            };
        });

        // Validador de longitud máxima
        this.addValidator('maxLength', (value, maxLength) => {
            return {
                valid: value.length <= maxLength,
                message: `No puede tener más de ${maxLength} caracteres`
            };
        });

        // Validador de campo requerido
        this.addValidator('required', (value) => {
            return {
                valid: value !== null && value !== undefined && value.toString().trim() !== '',
                message: 'Este campo es obligatorio'
            };
        });

        // Validador de selección múltiple
        this.addValidator('multipleSelection', (value, minSelections = 1) => {
            const selected = Array.isArray(value) ? value : [value].filter(Boolean);
            return {
                valid: selected.length >= minSelections,
                message: `Selecciona al menos ${minSelections} opción${minSelections > 1 ? 'es' : ''}`
            };
        });

        // Validador de URL
        this.addValidator('url', (value) => {
            try {
                new URL(value);
                return { valid: true };
            } catch {
                return {
                    valid: false,
                    message: 'Ingresa una URL válida'
                };
            }
        });

        // Validador de número
        this.addValidator('number', (value, min = null, max = null) => {
            const num = Number(value);
            if (isNaN(num)) {
                return { valid: false, message: 'Debe ser un número válido' };
            }
            if (min !== null && num < min) {
                return { valid: false, message: `Debe ser mayor o igual a ${min}` };
            }
            if (max !== null && num > max) {
                return { valid: false, message: `Debe ser menor o igual a ${max}` };
            }
            return { valid: true };
        });
    }

    // ===== GESTIÓN DE VALIDADORES =====
    addValidator(name, validator) {
        this.validators.set(name, validator);
    }

    getValidator(name) {
        return this.validators.get(name);
    }

    // ===== CONFIGURACIÓN DE REGLAS =====
    setRules(formId, rules) {
        this.rules[formId] = rules;
    }

    getRules(formId) {
        return this.rules[formId] || {};
    }

    // ===== VALIDACIÓN DE CAMPOS =====
    validateField(field, formId = null) {
        const fieldName = field.name || field.id;
        const value = this.getFieldValue(field);
        const rules = this.getRules(formId);
        const fieldRules = rules[fieldName] || [];

        // Limpiar errores previos
        this.clearFieldError(field);

        // Aplicar validaciones
        for (const rule of fieldRules) {
            const result = this.applyRule(value, rule, field);
            if (!result.valid) {
                this.setFieldError(field, result.message, rule.type || 'error');
                return false;
            }
        }

        // Marcar como válido
        this.setFieldSuccess(field);
        return true;
    }

    applyRule(value, rule, field) {
        const { type, params = [], message } = rule;
        const validator = this.getValidator(type);
        
        if (!validator) {
            console.warn(`Validator '${type}' not found`);
            return { valid: true };
        }

        try {
            const result = validator(value, ...params);
            return {
                valid: result.valid,
                message: result.message || message || 'Campo inválido'
            };
        } catch (error) {
            console.error(`Error in validator '${type}':`, error);
            return {
                valid: false,
                message: 'Error de validación'
            };
        }
    }

    // ===== VALIDACIÓN DE FORMULARIOS =====
    validateForm(form, formId = null) {
        const rules = this.getRules(formId);
        let isValid = true;
        const errors = [];

        // Validar campos individuales
        const fields = form.querySelectorAll('input, select, textarea');
        fields.forEach(field => {
            if (!this.validateField(field, formId)) {
                isValid = false;
                errors.push({
                    field: field.name || field.id,
                    message: this.getFieldError(field)
                });
            }
        });

        // Validaciones personalizadas del formulario
        if (rules._custom) {
            for (const customRule of rules._custom) {
                const result = customRule.validator(form);
                if (!result.valid) {
                    isValid = false;
                    errors.push({
                        field: customRule.field || 'form',
                        message: result.message
                    });
                }
            }
        }

        return { isValid, errors };
    }

    // ===== GESTIÓN DE VALORES =====
    getFieldValue(field) {
        if (field.type === 'checkbox') {
            return field.checked;
        }
        
        if (field.type === 'radio') {
            return field.checked ? field.value : null;
        }
        
        if (field.type === 'file') {
            return field.files;
        }
        
        return field.value;
    }

    // ===== GESTIÓN DE ERRORES =====
    setFieldError(field, message, type = 'error') {
        field.classList.add('error');
        field.classList.remove('success');
        
        // Remover mensaje anterior
        this.clearFieldError(field);
        
        // Crear mensaje de error
        const errorDiv = document.createElement('div');
        errorDiv.className = `field-error field-error-${type}`;
        errorDiv.textContent = message;
        
        // Insertar después del campo
        field.parentNode.insertBefore(errorDiv, field.nextSibling);
        
        // Guardar error
        this.errors.set(field.name || field.id, { message, type, field });
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorDiv = field.parentNode.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.remove();
        }
        this.errors.delete(field.name || field.id);
    }

    setFieldSuccess(field) {
        field.classList.remove('error');
        field.classList.add('success');
        this.clearFieldError(field);
    }

    getFieldError(field) {
        const error = this.errors.get(field.name || field.id);
        return error ? error.message : null;
    }

    // ===== GESTIÓN DE ADVERTENCIAS =====
    setFieldWarning(field, message) {
        field.classList.add('warning');
        this.warnings.set(field.name || field.id, { message, field });
    }

    clearFieldWarning(field) {
        field.classList.remove('warning');
        this.warnings.delete(field.name || field.id);
    }

    // ===== VALIDACIÓN EN TIEMPO REAL =====
    setupRealTimeValidation(form, formId = null) {
        const fields = form.querySelectorAll('input, select, textarea');
        
        fields.forEach(field => {
            // Validar al perder el foco
            field.addEventListener('blur', () => {
                this.validateField(field, formId);
            });
            
            // Limpiar errores al escribir
            field.addEventListener('input', () => {
                this.clearFieldError(field);
                field.classList.remove('success');
            });
            
            // Validar checkboxes y radios inmediatamente
            if (field.type === 'checkbox' || field.type === 'radio') {
                field.addEventListener('change', () => {
                    this.validateField(field, formId);
                });
            }
        });
    }

    // ===== EVENTOS =====
    setupEventListeners() {
        // Limpiar errores al cambiar de página
        window.addEventListener('beforeunload', () => {
            this.clearAllErrors();
        });
    }

    clearAllErrors() {
        this.errors.clear();
        this.warnings.clear();
        
        // Limpiar estilos de campos
        document.querySelectorAll('.error, .success, .warning').forEach(field => {
            field.classList.remove('error', 'success', 'warning');
        });
        
        // Remover mensajes de error
        document.querySelectorAll('.field-error').forEach(error => {
            error.remove();
        });
    }

    // ===== UTILIDADES =====
    getFormData(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            if (data[key]) {
                // Manejar arrays (checkboxes múltiples)
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    }

    // ===== VALIDACIONES ESPECÍFICAS DE UGC =====
    validateUgcPreferences(form) {
        const rules = {
            plataforma_principal: [
                { type: 'required', message: 'Selecciona una plataforma principal' }
            ],
            tipo_avatar: [
                { type: 'required', message: 'Selecciona un tipo de avatar' }
            ],
            tono_copy: [
                { type: 'required', message: 'Selecciona un tono para el copy' }
            ],
            mensaje_clave: [
                { type: 'minLength', params: [10], message: 'El mensaje clave debe tener al menos 10 caracteres' }
            ],
            _custom: [
                {
                    field: 'estilo_contenido',
                    validator: (form) => {
                        const selected = form.querySelectorAll('input[name="estilo_contenido"]:checked');
                        return {
                            valid: selected.length > 0,
                            message: 'Selecciona al menos un estilo de contenido'
                        };
                    }
                },
                {
                    field: 'tipos_escenarios',
                    validator: (form) => {
                        const selected = form.querySelectorAll('input[name="tipos_escenarios"]:checked');
                        return {
                            valid: selected.length > 0,
                            message: 'Selecciona al menos un tipo de escenario'
                        };
                    }
                }
            ]
        };
        
        this.setRules('preferences', rules);
        return this.validateForm(form, 'preferences');
    }

    validateUserRegistration(form) {
        const rules = {
            nombre: [
                { type: 'required', message: 'El nombre es obligatorio' },
                { type: 'minLength', params: [2], message: 'El nombre debe tener al menos 2 caracteres' }
            ],
            correo: [
                { type: 'required', message: 'El correo es obligatorio' },
                { type: 'email', message: 'Ingresa un correo válido' }
            ],
            contrasena: [
                { type: 'required', message: 'La contraseña es obligatoria' },
                { type: 'password', message: 'Contraseña inválida' }
            ],
            confirmar_contrasena: [
                { type: 'required', message: 'Confirma tu contraseña' },
                { 
                    type: 'passwordConfirm', 
                    params: [form.querySelector('[name="contrasena"]').value],
                    message: 'Las contraseñas no coinciden' 
                }
            ]
        };
        
        this.setRules('user', rules);
        return this.validateForm(form, 'user');
    }
}

// Inicializar validador global
window.validationManager = new ValidationManager();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationManager;
}
