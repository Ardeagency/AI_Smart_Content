// ===== SISTEMA DE NAVEGACIÓN MEJORADO =====
// Navegación robusta, validación de pasos y persistencia de estado

class NavigationManager {
    constructor() {
        this.steps = [
            { id: 'landing', name: 'Inicio', url: 'index.html', step: 0 },
            { id: 'preferences', name: 'Preferencias', url: 'datos-preferencias.html', step: 1 },
            { id: 'products', name: 'Productos', url: 'datos-productos.html', step: 2 },
            { id: 'brand', name: 'Marca', url: 'datos-marca.html', step: 3 },
            { id: 'user', name: 'Usuario', url: 'datos-usuario.html', step: 4 },
            { id: 'login', name: 'Login', url: 'login.html', step: 5 }
        ];
        
        this.currentStep = 0;
        this.completedSteps = new Set();
        this.blockedSteps = new Set();
        
        this.init();
    }

    init() {
        this.detectCurrentStep();
        this.loadProgress();
        this.setupEventListeners();
        this.updateProgressBar();
    }

    // ===== DETECCIÓN DE PASO ACTUAL =====
    detectCurrentStep() {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop();
        
        const step = this.steps.find(s => s.url === currentPage);
        if (step) {
            this.currentStep = step.step;
        }
    }

    // ===== NAVEGACIÓN =====
    navigateTo(stepId, options = {}) {
        const step = this.steps.find(s => s.id === stepId);
        if (!step) {
            console.error(`Step '${stepId}' not found`);
            return false;
        }

        // Validar si se puede navegar a este paso
        if (!this.canNavigateTo(step.step)) {
            this.showNavigationError(stepId);
            return false;
        }

        // Validar formulario actual si es necesario
        if (options.validateCurrent && !this.validateCurrentForm()) {
            return false;
        }

        // Guardar progreso actual
        this.saveProgress();

        // Navegar
        if (options.replace) {
            window.location.replace(step.url);
        } else {
            window.location.href = step.url;
        }

        return true;
    }

    navigateNext(options = {}) {
        const nextStep = this.currentStep + 1;
        if (nextStep < this.steps.length) {
            const step = this.steps[nextStep];
            return this.navigateTo(step.id, options);
        }
        return false;
    }

    navigatePrevious(options = {}) {
        const prevStep = this.currentStep - 1;
        if (prevStep >= 0) {
            const step = this.steps[prevStep];
            return this.navigateTo(step.id, options);
        }
        return false;
    }

    // ===== VALIDACIÓN DE NAVEGACIÓN =====
    canNavigateTo(targetStep) {
        // Siempre se puede ir al paso actual o anterior
        if (targetStep <= this.currentStep) {
            return true;
        }

        // Solo se puede ir al siguiente paso si el actual está completo
        if (targetStep === this.currentStep + 1) {
            return this.isCurrentStepComplete();
        }

        // No se puede saltar pasos
        return false;
    }

    isCurrentStepComplete() {
        const currentStepId = this.getCurrentStepId();
        
        switch (currentStepId) {
            case 'preferences':
                return this.validatePreferencesForm();
            case 'products':
                return this.validateProductsForm();
            case 'brand':
                return this.validateBrandForm();
            case 'user':
                return this.validateUserForm();
            default:
                return true;
        }
    }

    validateCurrentForm() {
        const form = document.querySelector('form');
        if (!form) return true;

        if (window.validationManager) {
            const result = window.validationManager.validateForm(form);
            if (!result.isValid) {
                this.showValidationErrors(result.errors);
                return false;
            }
        }

        return true;
    }

    // ===== VALIDACIONES ESPECÍFICAS =====
    validatePreferencesForm() {
        const form = document.getElementById('preferencesDataForm');
        if (!form) return true;

        // Validar campos requeridos
        const requiredFields = form.querySelectorAll('[required]');
        for (const field of requiredFields) {
            if (!field.value.trim()) {
                return false;
            }
        }

        // Validar estilos de contenido
        const estilos = form.querySelectorAll('input[name="estilo_contenido"]:checked');
        if (estilos.length === 0) {
            return false;
        }

        // Validar tipos de escenarios
        const escenarios = form.querySelectorAll('input[name="tipos_escenarios"]:checked');
        if (escenarios.length === 0) {
            return false;
        }

        return true;
    }

    validateProductsForm() {
        const form = document.getElementById('productDataForm');
        if (!form) return true;

        const requiredFields = form.querySelectorAll('[required]');
        for (const field of requiredFields) {
            if (!field.value.trim()) {
                return false;
            }
        }

        // Validar imágenes (debe tener exactamente 4)
        const imageInputs = form.querySelectorAll('input[type="file"]');
        let imageCount = 0;
        imageInputs.forEach(input => {
            if (input.files && input.files.length > 0) {
                imageCount += input.files.length;
            }
        });

        if (imageCount < 4) {
            return false;
        }

        return true;
    }

    validateBrandForm() {
        const form = document.getElementById('brandDataForm');
        if (!form) return true;

        const requiredFields = form.querySelectorAll('[required]');
        for (const field of requiredFields) {
            if (!field.value.trim()) {
                return false;
            }
        }

        return true;
    }

    validateUserForm() {
        const form = document.getElementById('userDataForm');
        if (!form) return true;

        const requiredFields = form.querySelectorAll('[required]');
        for (const field of requiredFields) {
            if (!field.value.trim()) {
                return false;
            }
        }

        // Validar contraseñas
        const password = form.querySelector('[name="contrasena"]');
        const confirmPassword = form.querySelector('[name="confirmar_contrasena"]');
        
        if (password && confirmPassword) {
            if (password.value !== confirmPassword.value) {
                return false;
            }
        }

        return true;
    }

    // ===== GESTIÓN DE PROGRESO =====
    markStepComplete(stepId) {
        this.completedSteps.add(stepId);
        this.saveProgress();
        this.updateProgressBar();
    }

    markStepIncomplete(stepId) {
        this.completedSteps.delete(stepId);
        this.saveProgress();
        this.updateProgressBar();
    }

    isStepComplete(stepId) {
        return this.completedSteps.has(stepId);
    }

    // ===== BARRAS DE PROGRESO =====
    updateProgressBar() {
        const progressBars = document.querySelectorAll('.progress-fill');
        progressBars.forEach(bar => {
            const percentage = this.getProgressPercentage();
            bar.style.width = `${percentage}%`;
        });

        // Actualizar indicadores de pasos completados
        this.updateStepIndicators();
    }

    getProgressPercentage() {
        const totalSteps = this.steps.length - 1; // Excluir landing
        const completedCount = this.completedSteps.size;
        return Math.round((completedCount / totalSteps) * 100);
    }

    updateStepIndicators() {
        const stepIndicators = document.querySelectorAll('.step-indicator');
        stepIndicators.forEach(indicator => {
            const stepId = indicator.dataset.step;
            if (this.isStepComplete(stepId)) {
                indicator.classList.add('completed');
            } else {
                indicator.classList.remove('completed');
            }
        });
    }

    // ===== PERSISTENCIA =====
    saveProgress() {
        const progress = {
            currentStep: this.currentStep,
            completedSteps: Array.from(this.completedSteps),
            timestamp: Date.now()
        };
        
        localStorage.setItem('ugc_navigation_progress', JSON.stringify(progress));
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('ugc_navigation_progress');
            if (saved) {
                const progress = JSON.parse(saved);
                this.currentStep = progress.currentStep || 0;
                this.completedSteps = new Set(progress.completedSteps || []);
            }
        } catch (error) {
            console.error('Error loading navigation progress:', error);
        }
    }

    clearProgress() {
        localStorage.removeItem('ugc_navigation_progress');
        this.completedSteps.clear();
        this.currentStep = 0;
    }

    // ===== EVENTOS =====
    setupEventListeners() {
        // Detectar cambios de página
        window.addEventListener('beforeunload', () => {
            this.saveProgress();
        });

        // Detectar envío de formularios
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.tagName === 'FORM') {
                this.handleFormSubmit(form);
            }
        });

        // Detectar clics en botones de navegación
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-navigate]')) {
                e.preventDefault();
                const stepId = e.target.dataset.navigate;
                this.navigateTo(stepId, { validateCurrent: true });
            }
        });
    }

    handleFormSubmit(form) {
        // Marcar paso como completo si el formulario se envía exitosamente
        const currentStepId = this.getCurrentStepId();
        if (currentStepId && currentStepId !== 'landing' && currentStepId !== 'login') {
            this.markStepComplete(currentStepId);
        }
    }

    // ===== UTILIDADES =====
    getCurrentStepId() {
        const step = this.steps.find(s => s.step === this.currentStep);
        return step ? step.id : null;
    }

    getCurrentStep() {
        return this.steps.find(s => s.step === this.currentStep);
    }

    getNextStep() {
        if (this.currentStep + 1 < this.steps.length) {
            return this.steps[this.currentStep + 1];
        }
        return null;
    }

    getPreviousStep() {
        if (this.currentStep - 1 >= 0) {
            return this.steps[this.currentStep - 1];
        }
        return null;
    }

    // ===== MENSAJES DE ERROR =====
    showNavigationError(stepId) {
        const step = this.steps.find(s => s.id === stepId);
        const message = `No puedes saltar al paso "${step.name}". Completa el paso actual primero.`;
        
        if (window.contextManager) {
            window.contextManager.addError({
                message,
                type: 'navigation'
            });
        } else {
            alert(message);
        }
    }

    showValidationErrors(errors) {
        if (window.contextManager) {
            errors.forEach(error => {
                window.contextManager.addError({
                    message: error.message,
                    type: 'validation',
                    field: error.field
                });
            });
        } else {
            const message = errors.map(e => e.message).join('\n');
            alert(message);
        }
    }

    // ===== API PÚBLICA =====
    getStepInfo(stepId) {
        return this.steps.find(s => s.id === stepId);
    }

    getAllSteps() {
        return [...this.steps];
    }

    getCompletedSteps() {
        return Array.from(this.completedSteps);
    }

    reset() {
        this.clearProgress();
        this.currentStep = 0;
        this.completedSteps.clear();
        this.blockedSteps.clear();
    }
}

// Inicializar navegador global
window.navigationManager = new NavigationManager();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}
