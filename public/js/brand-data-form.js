// ===== FORMULARIO DE DATOS DE LA MARCA =====

class BrandDataForm {
    constructor() {
        this.form = document.getElementById('brandDataForm');
        this.currentStep = 2;
        this.totalSteps = 4;
        this.brandData = {};
        this.colorCount = 4;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSavedData();
        this.setupValidation();
        this.setupColorPickers();
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

        // Upload de logo
        const logoInput = document.getElementById('logo_url');
        if (logoInput) {
            logoInput.addEventListener('change', (e) => this.handleLogoUpload(e));
        }

        // Upload de archivos adicionales
        const filesInput = document.getElementById('archivos_adicionales');
        if (filesInput) {
            filesInput.addEventListener('change', (e) => this.handleFilesUpload(e));
        }
    }

    setupValidation() {
        // Reglas de validación
        this.validationRules = {
            nombre_marca: {
                required: true,
                minLength: 2,
                message: 'El nombre de la marca debe tener al menos 2 caracteres'
            },
            nicho_principal: {
                required: true,
                message: 'Selecciona un nicho principal'
            },
            publico_objetivo: {
                required: true,
                minLength: 20,
                message: 'Describe tu público objetivo con al menos 20 caracteres'
            },
            identidad_proposito: {
                required: true,
                minLength: 30,
                message: 'Describe la identidad y propósito con al menos 30 caracteres'
            }
        };
    }

    setupColorPickers() {
        // Sincronizar color pickers con inputs de texto
        for (let i = 1; i <= this.colorCount; i++) {
            const colorPicker = document.getElementById(`color${i}`);
            const colorText = document.getElementById(`color${i}_text`);
            
            if (colorPicker && colorText) {
                colorPicker.addEventListener('input', () => {
                    colorText.value = colorPicker.value.toUpperCase();
                });
                
                colorText.addEventListener('input', () => {
                    if (/^#[0-9A-F]{6}$/i.test(colorText.value)) {
                        colorPicker.value = colorText.value;
                    }
                });
            }
        }
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

    handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
            this.showNotification('Solo se permiten archivos de imagen', 'error');
            return;
        }

        // Validar tamaño (máximo 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showNotification('El archivo debe ser menor a 10MB', 'error');
            return;
        }

        // Crear preview del logo
        const reader = new FileReader();
        reader.onload = (e) => {
            this.createLogoPreview(e.target.result);
        };
        reader.readAsDataURL(file);

        this.showNotification('Logo cargado exitosamente', 'success');
    }

    createLogoPreview(imageUrl) {
        // Remover preview anterior si existe
        const existingPreview = document.querySelector('.logo-preview');
        if (existingPreview) {
            existingPreview.remove();
        }

        // Crear nuevo preview
        const preview = document.createElement('div');
        preview.className = 'logo-preview';
        preview.innerHTML = `
            <img src="${imageUrl}" alt="Logo preview" style="max-width: 120px; max-height: 60px; object-fit: contain; margin-top: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem;">
            <button type="button" class="remove-logo" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        const fileLabel = document.querySelector('#logo_url').parentNode;
        fileLabel.appendChild(preview);
    }

    handleFilesUpload(event) {
        const files = Array.from(event.target.files);
        
        if (files.length === 0) return;

        // Validar archivos
        const validFiles = files.filter(file => {
            const validTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.svg'];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            return validTypes.includes(fileExtension);
        });

        if (validFiles.length !== files.length) {
            this.showNotification('Algunos archivos no son válidos. Solo se permiten PDF, DOC, DOCX, JPG, PNG, SVG', 'error');
        }

        if (validFiles.length > 0) {
            this.createFilesPreview(validFiles);
            this.showNotification(`${validFiles.length} archivo(s) cargado(s) exitosamente`, 'success');
        }
    }

    createFilesPreview(files) {
        // Remover preview anterior si existe
        const existingPreview = document.querySelector('.files-preview');
        if (existingPreview) {
            existingPreview.remove();
        }

        // Crear nuevo preview
        const preview = document.createElement('div');
        preview.className = 'files-preview';
        preview.innerHTML = `
            <div class="files-list">
                ${files.map(file => `
                    <div class="file-item">
                        <i class="fas fa-file"></i>
                        <span>${file.name}</span>
                        <span class="file-size">(${this.formatFileSize(file.size)})</span>
                    </div>
                `).join('')}
            </div>
        `;

        const fileLabel = document.querySelector('#archivos_adicionales').parentNode;
        fileLabel.appendChild(preview);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    collectFormData() {
        const formData = new FormData(this.form);
        const brandData = {};

        // Recopilar datos del formulario
        for (let [key, value] of formData.entries()) {
            if (key === 'categorias_asociadas' || key === 'personalidad_atributos') {
                // Manejar arrays de checkboxes
                if (!brandData[key]) {
                    brandData[key] = [];
                }
                brandData[key].push(value);
            } else if (key === 'logo_url' && value instanceof File) {
                // Para el logo, guardar la URL temporal
                brandData[key] = URL.createObjectURL(value);
            } else if (key.startsWith('color') && key.endsWith('_text')) {
                // Manejar colores
                const colorIndex = key.replace('color', '').replace('_text', '');
                if (!brandData.paleta_colores) {
                    brandData.paleta_colores = [];
                }
                brandData.paleta_colores[parseInt(colorIndex) - 1] = value;
            } else if (key.startsWith('color') && !key.includes('_text')) {
                // Ignorar los color pickers, solo usar los textos
                continue;
            } else {
                brandData[key] = value;
            }
        }

        // Agregar campos adicionales requeridos por Supabase
        brandData.user_id = this.getUserId();
        brandData.activo = true;
        brandData.creado_en = new Date().toISOString();
        brandData.actualizado_en = new Date().toISOString();

        // Procesar tipografías
        if (brandData.tipografia_principal || brandData.tipografia_secundaria) {
            brandData.tipografias = {
                principal: brandData.tipografia_principal,
                secundaria: brandData.tipografia_secundaria
            };
            delete brandData.tipografia_principal;
            delete brandData.tipografia_secundaria;
        }

        return brandData;
    }

    getUserId() {
        // Obtener el user_id de los datos guardados
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        return savedData.user?.user_id || 'temp_user_' + Date.now();
    }

    validateForm() {
        let isValid = true;
        const requiredFields = this.form.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Validar que al menos una categoría esté seleccionada
        const categorias = this.form.querySelectorAll('input[name="categorias_asociadas"]:checked');
        if (categorias.length === 0) {
            this.showNotification('Selecciona al menos una categoría asociada', 'error');
            isValid = false;
        }

        // Validar que al menos un atributo de personalidad esté seleccionado
        const personalidad = this.form.querySelectorAll('input[name="personalidad_atributos"]:checked');
        if (personalidad.length === 0) {
            this.showNotification('Selecciona al menos un atributo de personalidad', 'error');
            isValid = false;
        }

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
            const brandData = this.collectFormData();
            
            // Guardar en localStorage temporalmente
            this.saveToLocalStorage(brandData);
            
            // Simular envío a Supabase
            await this.submitToSupabase(brandData);
            
            // Mostrar éxito y continuar
            this.showNotification('Datos de la marca guardados exitosamente', 'success');
            
            // Redirigir al siguiente paso
            setTimeout(() => {
                window.location.href = 'datos-usuario.html';
            }, 1500);

        } catch (error) {
            console.error('Error al guardar datos de la marca:', error);
            this.showNotification('Error al guardar los datos. Inténtalo de nuevo.', 'error');
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async submitToSupabase(brandData) {
        try {
            // Usar la API de Supabase
            const result = await window.supabaseAPI.createBrand(brandData);
            
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

    saveToLocalStorage(brandData) {
        // Guardar datos temporalmente en localStorage
        const existingData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        existingData.brand = brandData;
        localStorage.setItem('ugc_studio_data', JSON.stringify(existingData));
    }

    loadSavedData() {
        // Cargar datos guardados si existen
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        if (savedData.brand) {
            this.populateForm(savedData.brand);
        }
    }

    populateForm(brandData) {
        // Llenar formulario con datos guardados
        Object.keys(brandData).forEach(key => {
            if (key === 'categorias_asociadas' || key === 'personalidad_atributos') {
                // Manejar arrays de checkboxes
                if (Array.isArray(brandData[key])) {
                    brandData[key].forEach(value => {
                        const checkbox = this.form.querySelector(`input[name="${key}"][value="${value}"]`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                }
            } else if (key === 'paleta_colores' && Array.isArray(brandData[key])) {
                // Manejar paleta de colores
                brandData[key].forEach((color, index) => {
                    const colorPicker = document.getElementById(`color${index + 1}`);
                    const colorText = document.getElementById(`color${index + 1}_text`);
                    if (colorPicker && colorText) {
                        colorPicker.value = color;
                        colorText.value = color;
                    }
                });
            } else if (key === 'tipografias' && typeof brandData[key] === 'object') {
                // Manejar tipografías
                if (brandData[key].principal) {
                    const principalSelect = document.getElementById('tipografia_principal');
                    if (principalSelect) {
                        principalSelect.value = brandData[key].principal;
                    }
                }
                if (brandData[key].secundaria) {
                    const secundariaSelect = document.getElementById('tipografia_secundaria');
                    if (secundariaSelect) {
                        secundariaSelect.value = brandData[key].secundaria;
                    }
                }
            } else {
                const field = this.form.querySelector(`[name="${key}"]`);
                if (field) {
                    if (field.type === 'checkbox') {
                        field.checked = brandData[key];
                    } else {
                        field.value = brandData[key];
                    }
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

// Función global para agregar color
function addColorInput() {
    const colorContainer = document.querySelector('.color-inputs');
    const brandForm = new BrandDataForm();
    
    if (brandForm.colorCount >= 8) {
        brandForm.showNotification('Máximo 8 colores permitidos', 'error');
        return;
    }
    
    brandForm.colorCount++;
    const newColorGroup = document.createElement('div');
    newColorGroup.className = 'color-input-group';
    newColorGroup.innerHTML = `
        <input type="color" id="color${brandForm.colorCount}" name="color${brandForm.colorCount}" value="#000000" class="color-picker">
        <input type="text" id="color${brandForm.colorCount}_text" value="#000000" class="color-text" placeholder="#000000">
    `;
    
    colorContainer.appendChild(newColorGroup);
    
    // Configurar event listeners para el nuevo color
    const colorPicker = document.getElementById(`color${brandForm.colorCount}`);
    const colorText = document.getElementById(`color${brandForm.colorCount}_text`);
    
    colorPicker.addEventListener('input', () => {
        colorText.value = colorPicker.value.toUpperCase();
    });
    
    colorText.addEventListener('input', () => {
        if (/^#[0-9A-F]{6}$/i.test(colorText.value)) {
            colorPicker.value = colorText.value;
        }
    });
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new BrandDataForm();
});

// Agregar estilos adicionales
const style = document.createElement('style');
style.textContent = `
    .color-picker-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .color-inputs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }
    
    .color-input-group {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    
    .color-picker {
        width: 50px;
        height: 40px;
        border: 2px solid var(--border-color);
        border-radius: 8px;
        cursor: pointer;
        background: transparent;
    }
    
    .color-text {
        flex: 1;
        padding: 0.5rem;
        border: 2px solid var(--border-color);
        border-radius: 8px;
        background: var(--primary-bg);
        color: var(--text-primary);
        font-family: monospace;
        font-size: 0.9rem;
    }
    
    .personality-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.75rem;
    }
    
    .logo-preview {
        position: relative;
        display: inline-block;
        margin-top: 0.5rem;
    }
    
    .remove-logo {
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
    
    .files-preview {
        margin-top: 0.5rem;
    }
    
    .files-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .file-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--primary-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 0.9rem;
    }
    
    .file-item i {
        color: var(--accent-color);
    }
    
    .file-size {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
`;
document.head.appendChild(style);
