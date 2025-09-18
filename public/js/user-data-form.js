// ===== FORMULARIO DE DATOS DEL USUARIO =====

class UserDataForm {
    constructor() {
        this.form = document.getElementById('userDataForm');
        this.currentStep = 1;
        this.totalSteps = 4;
        this.userData = {};
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSavedData();
        this.setupValidation();
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

        // Upload de avatar eliminado - ya no se necesita
    }

    setupValidation() {
        // Reglas de validación
        this.validationRules = {
            nombre: {
                required: true,
                minLength: 2,
                message: 'El nombre debe tener al menos 2 caracteres'
            },
            correo: {
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Ingresa un correo electrónico válido'
            }
        };
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

    // Funciones de avatar eliminadas - ya no se necesitan

    collectFormData() {
        const formData = new FormData(this.form);
        const userData = {};

        // Recopilar datos del formulario
        for (let [key, value] of formData.entries()) {
            userData[key] = value;
        }

        // Agregar campos adicionales requeridos por Supabase
        userData.user_id = this.generateUserId();
        userData.acceso = 'usuario';
        userData.activo = true;
        userData.email_verificado = false;
        userData.creado_en = new Date().toISOString();
        userData.actualizado_en = new Date().toISOString();

        return userData;
    }

    generateUserId() {
        // Generar un ID único para el usuario
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    validateForm() {
        let isValid = true;
        const requiredFields = this.form.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    async handleSubmit() {
        // Validar formulario
        if (!this.validateForm()) {
            this.showNotification('Por favor, corrige los errores en el formulario', 'error');
            return;
        }

        // Mostrar loading
        const submitBtn = this.form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        submitBtn.disabled = true;

        try {
            // Recopilar datos
            const userData = this.collectFormData();
            
            // Guardar en localStorage temporalmente
            this.saveToLocalStorage(userData);
            
            // Simular envío a Supabase
            await this.submitToSupabase(userData);
            
            // Mostrar éxito y continuar
            this.showNotification('Datos del usuario guardados exitosamente', 'success');
            
            // Redirigir al siguiente paso
            setTimeout(() => {
                window.location.href = 'datos-marca.html';
            }, 1500);

        } catch (error) {
            console.error('Error al guardar datos del usuario:', error);
            this.showNotification('Error al guardar los datos. Inténtalo de nuevo.', 'error');
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async submitToSupabase(userData) {
        try {
            // Simular llamada a Supabase
            console.log('Enviando datos a Supabase:', userData);
            
            // Aquí iría la llamada real a Supabase
            // const response = await fetch('/api/users', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(userData)
            // });
            
            // Simular delay de red
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return { success: true, message: 'Usuario creado exitosamente' };
        } catch (error) {
            throw new Error('Error de conexión con la base de datos');
        }
    }

    saveToLocalStorage(userData) {
        // Guardar datos temporalmente en localStorage
        const existingData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        existingData.user = userData;
        localStorage.setItem('ugc_studio_data', JSON.stringify(existingData));
    }

    loadSavedData() {
        // Cargar datos guardados si existen
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        if (savedData.user) {
            this.populateForm(savedData.user);
        }
    }

    populateForm(userData) {
        // Llenar formulario con datos guardados
        Object.keys(userData).forEach(key => {
            const field = this.form.querySelector(`[name="${key}"]`);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = userData[key];
                } else {
                    field.value = userData[key];
                }
            }
        });
    }

    showNotification(message, type = 'info') {
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
    new UserDataForm();
});

// Agregar estilos de animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .avatar-preview {
        position: relative;
        display: inline-block;
        margin-top: 0.5rem;
    }
    
    .remove-avatar {
        position: absolute;
        top: -5px;
        right: -5px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #ef4444;
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
    }
    
    .remove-avatar:hover {
        background: #dc2626;
    }
`;
document.head.appendChild(style);
