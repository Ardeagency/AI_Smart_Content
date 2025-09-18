// ===== FORMULARIO DE DATOS DE PRODUCTOS/SERVICIOS =====

class ProductDataForm {
    constructor() {
        this.form = document.getElementById('productDataForm');
        this.currentStep = 3;
        this.totalSteps = 4;
        this.productData = {};
        this.features = [];
        this.benefits = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSavedData();
        this.setupValidation();
        this.setupFeatures();
        this.setupBenefits();
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

        // Upload de imágenes
        const imagenesProducto = document.getElementById('imagenes_producto');
        if (imagenesProducto) {
            imagenesProducto.addEventListener('change', (e) => this.handleImageUpload(e));
        }
    }

    setupValidation() {
        // Reglas de validación
        this.validationRules = {
            nombre_producto: {
                required: true,
                minLength: 3,
                message: 'El nombre del producto debe tener al menos 3 caracteres'
            },
            tipo_producto: {
                required: true,
                message: 'Selecciona el tipo de producto'
            },
            categoria: {
                required: true,
                message: 'Selecciona una categoría'
            },
            descripcion: {
                required: true,
                minLength: 20,
                message: 'La descripción debe tener al menos 20 caracteres'
            }
        };
    }


    setupFeatures() {
        // Configurar inputs de características existentes
        const featureInputs = document.querySelectorAll('.feature-input');
        featureInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                this.updateFeatures();
            });
        });
    }

    setupBenefits() {
        // Configurar inputs de beneficios existentes
        const benefitInputs = document.querySelectorAll('.benefit-input');
        benefitInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                this.updateBenefits();
            });
        });
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


    updateFeatures() {
        const featureInputs = document.querySelectorAll('.feature-input');
        this.features = Array.from(featureInputs)
            .map(input => input.value.trim())
            .filter(value => value.length > 0);
    }

    updateBenefits() {
        const benefitInputs = document.querySelectorAll('.benefit-input');
        this.benefits = Array.from(benefitInputs)
            .map(input => input.value.trim())
            .filter(value => value.length > 0);
    }

    handleImageUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Validar que sean exactamente 4 imágenes
        if (files.length !== 4) {
            this.showNotification('Debes subir exactamente 4 imágenes del producto', 'error');
            event.target.value = ''; // Limpiar el input
            return;
        }

        // Validar que todos los archivos sean imágenes
        const validFiles = files.filter(file => {
            return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024; // 10MB max
        });

        if (validFiles.length !== 4) {
            this.showNotification('Todos los archivos deben ser imágenes válidas (JPG, PNG, WebP) menores a 10MB', 'error');
            event.target.value = ''; // Limpiar el input
            return;
        }

        // Crear preview de las imágenes
        this.createImagePreview(validFiles);
        this.showNotification('4 imágenes cargadas exitosamente', 'success');
    }

    createImagePreview(files) {
        // Remover preview anterior si existe
        const existingPreview = document.querySelector('.images-preview');
        if (existingPreview) {
            existingPreview.remove();
        }

        // Crear nuevo preview
        const preview = document.createElement('div');
        preview.className = 'images-preview';
        preview.innerHTML = `
            <div class="images-grid">
                ${files.map((file, index) => `
                    <div class="image-item">
                        <img src="${URL.createObjectURL(file)}" alt="Imagen ${index + 1}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid var(--accent-color);">
                        <div class="image-number">${index + 1}</div>
                    </div>
                `).join('')}
            </div>
        `;

        const fileLabel = document.querySelector('#imagenes_producto').parentNode;
        fileLabel.appendChild(preview);
    }


    collectFormData() {
        const formData = new FormData(this.form);
        const productData = {};

        // Recopilar datos del formulario
        for (let [key, value] of formData.entries()) {
            if (key === 'imagenes_producto' && value instanceof File) {
                if (!productData.imagenes_producto) {
                    productData.imagenes_producto = [];
                }
                productData.imagenes_producto.push(URL.createObjectURL(value));
            } else {
                productData[key] = value;
            }
        }

        // Agregar datos procesados
        productData.caracteristicas_principales = this.features;
        productData.beneficios = this.benefits;

        // Agregar campos adicionales requeridos por Supabase
        productData.user_id = this.getUserId();
        productData.brand_id = this.getBrandId();
        productData.activo = true;
        productData.creado_en = new Date().toISOString();
        productData.actualizado_en = new Date().toISOString();

        // Procesar especificaciones técnicas
        if (productData.peso || productData.largo || productData.ancho || productData.alto) {
            productData.especificaciones_tecnicas = {
                peso: productData.peso ? {
                    valor: productData.peso,
                    unidad: productData.unidad_peso
                } : null,
                dimensiones: (productData.largo || productData.ancho || productData.alto) ? {
                    largo: productData.largo,
                    ancho: productData.ancho,
                    alto: productData.alto,
                    unidad: productData.unidad_dimensiones
                } : null
            };
        }

        return productData;
    }

    getUserId() {
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        return savedData.user?.user_id || 'temp_user_' + Date.now();
    }

    getBrandId() {
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        return savedData.brand?.user_id || 'temp_brand_' + Date.now();
    }

    validateForm() {
        let isValid = true;
        const requiredFields = this.form.querySelectorAll('[required]');

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        // Validar que se hayan subido exactamente 4 imágenes
        const imagenesInput = document.getElementById('imagenes_producto');
        if (!imagenesInput.files || imagenesInput.files.length !== 4) {
            this.showNotification('Debes subir exactamente 4 imágenes del producto', 'error');
            isValid = false;
        }

        // Validar que al menos una característica esté definida
        if (this.features.length === 0) {
            this.showNotification('Agrega al menos una característica principal', 'error');
            isValid = false;
        }

        // Validar que al menos un beneficio esté definido
        if (this.benefits.length === 0) {
            this.showNotification('Agrega al menos un beneficio', 'error');
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
            const productData = this.collectFormData();
            
            // Guardar en localStorage temporalmente
            this.saveToLocalStorage(productData);
            
            // Simular envío a Supabase
            await this.submitToSupabase(productData);
            
            // Mostrar éxito y continuar
            this.showNotification('Datos del producto guardados exitosamente', 'success');
            
            // Redirigir al siguiente paso
            setTimeout(() => {
                window.location.href = 'datos-preferencias.html';
            }, 1500);

        } catch (error) {
            console.error('Error al guardar datos del producto:', error);
            this.showNotification('Error al guardar los datos. Inténtalo de nuevo.', 'error');
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async submitToSupabase(productData) {
        try {
            // Simular llamada a Supabase
            console.log('Enviando datos del producto a Supabase:', productData);
            
            // Aquí iría la llamada real a Supabase
            // const response = await fetch('/api/products', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(productData)
            // });
            
            // Simular delay de red
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return { success: true, message: 'Producto creado exitosamente' };
        } catch (error) {
            throw new Error('Error de conexión con la base de datos');
        }
    }

    saveToLocalStorage(productData) {
        // Guardar datos temporalmente en localStorage
        const existingData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        if (!existingData.products) {
            existingData.products = [];
        }
        existingData.products.push(productData);
        localStorage.setItem('ugc_studio_data', JSON.stringify(existingData));
    }

    loadSavedData() {
        // Cargar datos guardados si existen
        const savedData = JSON.parse(localStorage.getItem('ugc_studio_data') || '{}');
        if (savedData.products && savedData.products.length > 0) {
            // Cargar el último producto agregado
            const lastProduct = savedData.products[savedData.products.length - 1];
            this.populateForm(lastProduct);
        }
    }

    populateForm(productData) {
        // Llenar formulario con datos guardados
        Object.keys(productData).forEach(key => {
            if (key === 'tags' && Array.isArray(productData[key])) {
                this.tags = [...productData[key]];
                this.renderTags();
            } else if (key === 'caracteristicas_principales' && Array.isArray(productData[key])) {
                this.features = [...productData[key]];
                this.updateFeatureInputs();
            } else if (key === 'beneficios' && Array.isArray(productData[key])) {
                this.benefits = [...productData[key]];
                this.updateBenefitInputs();
            } else {
                const field = this.form.querySelector(`[name="${key}"]`);
                if (field) {
                    field.value = productData[key];
                }
            }
        });
    }

    updateFeatureInputs() {
        const featureInputs = document.querySelectorAll('.feature-input');
        featureInputs.forEach((input, index) => {
            input.value = this.features[index] || '';
        });
    }

    updateBenefitInputs() {
        const benefitInputs = document.querySelectorAll('.benefit-input');
        benefitInputs.forEach((input, index) => {
            input.value = this.benefits[index] || '';
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

// Funciones globales para agregar características y beneficios
function addFeature() {
    const container = document.querySelector('.feature-inputs');
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'form-input feature-input';
    newInput.placeholder = `Característica ${container.children.length + 1}`;
    newInput.addEventListener('input', () => productForm.updateFeatures());
    container.appendChild(newInput);
}

function addBenefit() {
    const container = document.querySelector('.benefit-inputs');
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'form-input benefit-input';
    newInput.placeholder = `Beneficio ${container.children.length + 1}`;
    newInput.addEventListener('input', () => productForm.updateBenefits());
    container.appendChild(newInput);
}

// Inicializar cuando el DOM esté listo
let productForm;
document.addEventListener('DOMContentLoaded', () => {
    productForm = new ProductDataForm();
});

// Agregar estilos adicionales
const style = document.createElement('style');
style.textContent = `
    .features-container,
    .benefits-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .feature-inputs,
    .benefit-inputs {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .btn-sm {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        align-self: flex-start;
    }
    
    .images-preview {
        margin-top: 1rem;
    }
    
    .images-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        max-width: 300px;
    }
    
    .image-item {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    
    .image-number {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--accent-color);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.8rem;
        border: 2px solid white;
    }
    
    .image-item img {
        transition: transform 0.2s ease;
    }
    
    .image-item:hover img {
        transform: scale(1.05);
    }
`;
document.head.appendChild(style);
