/* =======================================
   UGC Studio - JavaScript Cinematográfico
   ======================================= */

class UGCStudioCinematic {
    constructor() {
        this.state = {
            activeModal: null,
            selectedBrand: 'mi-marca',
            selectedProduct: null,
            selectedOffer: null,
            selectedCategory: 'unboxing',
            selectedStyle: 'casual',
            selectedFormat: 'horizontal',
            selectedCountry: 'es',
            selectedLanguage: 'es',
            selectedAccent: 'neutral',
            selectedGender: 'male',
            selectedAges: ['18-24', '25-34'],
            selectedThemes: ['tecnologia', 'gaming'],
            creativityLevel: 75,
            progress: 0
        };
        
        this.init();
    }

    init() {
        this.initializeLucideIcons();
        this.setupIconButtons();
        this.setupModalClosing();
        this.setupInteractions();
        this.setupProgressTracking();
        this.setupKeyboardShortcuts();
        
        // Inicializar estado visual
        setTimeout(() => {
            this.updateProgress();
            this.initializeActiveStates();
        }, 100);
    }

    /* =======================================
       Inicialización
       ======================================= */

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    initializeActiveStates() {
        // Marcar elementos seleccionados por defecto
        this.selectBrand(this.state.selectedBrand);
        this.selectCategory(this.state.selectedCategory);
        this.selectStyle(this.state.selectedStyle);
        this.selectFormat(this.state.selectedFormat);
        this.selectCountry(this.state.selectedCountry);
        this.selectLanguage(this.state.selectedLanguage);
        this.selectAccent(this.state.selectedAccent);
        this.selectGender(this.state.selectedGender);
        
        // Activar temas y edades seleccionados
        this.state.selectedThemes.forEach(theme => {
            const chip = document.querySelector(`[data-theme="${theme}"]`);
            if (chip) chip.classList.add('active');
        });
        
        this.state.selectedAges.forEach(age => {
            const chip = document.querySelector(`[data-age="${age}"]`);
            if (chip) chip.classList.add('active');
        });
    }

    /* =======================================
       Manejo de Paneles Flotantes
       ======================================= */

    setupIconButtons() {
        const iconButtons = document.querySelectorAll('.icon-button');
        
        iconButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const modalName = button.getAttribute('data-panel');
                this.openModal(modalName);
            });
        });
    }

    openModal(modalName) {
        const modal = document.getElementById(`modal-${modalName}`);
        const button = document.querySelector(`[data-panel="${modalName}"]`);
        
        if (!modal) return;
        
        // Cerrar modal activo si existe
        if (this.state.activeModal) {
            this.closeModal(this.state.activeModal);
        }
        
        // Activar modal
        modal.classList.add('active');
        
        // Activar botón
        if (button) {
            button.classList.add('active');
        }
        
        // Actualizar estado
        this.state.activeModal = modalName;
        
        // Enfocar primer elemento interactivo
        setTimeout(() => {
            const firstInteractive = modal.querySelector('button, .brand-card, .product-item, .chip, input');
            if (firstInteractive) {
                firstInteractive.focus();
            }
        }, 200);
    }

    closeModal(modalName) {
        const modal = document.getElementById(`modal-${modalName}`);
        const button = document.querySelector(`[data-panel="${modalName}"]`);
        
        if (!modal) return;
        
        // Desactivar modal
        modal.classList.remove('active');
        
        // Desactivar botón
        if (button) {
            button.classList.remove('active');
        }
        
        // Actualizar estado
        this.state.activeModal = null;
    }

    setupModalClosing() {
        // Botones de cerrar
        const closeButtons = document.querySelectorAll('.brand-modal-close');
        closeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const modalName = button.getAttribute('data-close');
                this.closeModal(modalName);
            });
        });
        
        // Cerrar al hacer clic en overlay
        const modals = document.querySelectorAll('.brand-modal-overlay');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    const modalName = modal.id.replace('modal-', '');
                    this.closeModal(modalName);
                }
            });
        });
        
        // Prevenir cierre al hacer clic dentro del modal
        const modalBodies = document.querySelectorAll('.brand-modal');
        modalBodies.forEach(modal => {
            modal.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    /* =======================================
       Interacciones de Contenido
       ======================================= */

    setupInteractions() {
        // Marcas
        this.setupBrandSelection();
        
        // Productos
        this.setupProductSelection();
        
        // Ofertas
        this.setupOfferSelection();
        
        // Temas
        this.setupThemeSelection();
        
        // Categorías
        this.setupCategorySelection();
        
        // Estilos
        this.setupStyleSelection();
        
        // Formato
        this.setupFormatSelection();
        
        // Localización
        this.setupLocalizationSelection();
        
        // Género
        this.setupGenderSelection();
        
        // Edad
        this.setupAgeSelection();
        
        // Creatividad
        this.setupCreativitySlider();
        
        // Formulario inline
        this.setupInlineForm();
        
        // Botones de acción
        this.setupActionButtons();
    }

    setupBrandSelection() {
        const brandCards = document.querySelectorAll('.brand-card');
        
        brandCards.forEach(card => {
            card.addEventListener('click', () => {
                const brandId = card.getAttribute('data-brand');
                this.selectBrand(brandId);
            });
        });
    }

    selectBrand(brandId) {
        // Remover selección previa
        document.querySelectorAll('.brand-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Seleccionar nueva marca
        const selectedCard = document.querySelector(`[data-brand="${brandId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        this.state.selectedBrand = brandId;
        this.updateProgress();
        
        // Filtrar productos (simulado)
        this.filterProductsByBrand(brandId);
    }

    filterProductsByBrand(brandId) {
        // Aquí simularíamos el filtrado real de productos
        this.state.selectedProduct = null;
        
        // Remover selecciones de productos
        document.querySelectorAll('.product-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        this.updateProgress();
    }

    setupProductSelection() {
        const productItems = document.querySelectorAll('.product-item');
        
        productItems.forEach(item => {
            item.addEventListener('click', () => {
                const productId = item.getAttribute('data-product');
                this.selectProduct(productId);
            });
        });
    }

    selectProduct(productId) {
        // Remover selección previa
        document.querySelectorAll('.product-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Seleccionar nuevo producto
        const selectedItem = document.querySelector(`[data-product="${productId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        this.state.selectedProduct = productId;
        this.updateProgress();
    }

    setupOfferSelection() {
        const offerItems = document.querySelectorAll('.offer-item');
        
        offerItems.forEach(item => {
            item.addEventListener('click', () => {
                // Remover selección previa
                offerItems.forEach(o => o.classList.remove('selected'));
                
                // Seleccionar oferta
                item.classList.add('selected');
                
                const offerName = item.querySelector('.offer-name').textContent;
                this.state.selectedOffer = offerName;
                this.updateProgress();
            });
        });
    }

    setupThemeSelection() {
        const chips = document.querySelectorAll('.chip[data-theme]');
        
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const themeId = chip.getAttribute('data-theme');
                this.toggleTheme(themeId);
            });
        });
    }

    toggleTheme(themeId) {
        const chip = document.querySelector(`[data-theme="${themeId}"]`);
        if (!chip) return;
        
        chip.classList.toggle('active');
        
        // Actualizar array de temas seleccionados
        if (chip.classList.contains('active')) {
            if (!this.state.selectedThemes.includes(themeId)) {
                this.state.selectedThemes.push(themeId);
            }
        } else {
            this.state.selectedThemes = this.state.selectedThemes.filter(t => t !== themeId);
        }
        
        this.updateProgress();
    }

    setupCategorySelection() {
        const categoryCards = document.querySelectorAll('.category-card');
        
        categoryCards.forEach(card => {
            card.addEventListener('click', () => {
                const categoryId = card.getAttribute('data-category');
                this.selectCategory(categoryId);
            });
        });
    }

    selectCategory(categoryId) {
        // Remover selección previa
        document.querySelectorAll('.category-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Seleccionar nueva categoría
        const selectedCard = document.querySelector(`[data-category="${categoryId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        this.state.selectedCategory = categoryId;
        this.updateProgress();
    }

    setupStyleSelection() {
        const styleCards = document.querySelectorAll('.style-card');
        
        styleCards.forEach(card => {
            card.addEventListener('click', () => {
                // Remover selección previa
                styleCards.forEach(c => c.classList.remove('selected'));
                
                // Seleccionar nuevo estilo
                card.classList.add('selected');
                
                const styleName = card.querySelector('.style-name').textContent;
                this.state.selectedStyle = styleName.toLowerCase().replace(/\s+/g, '-');
                this.updateProgress();
            });
        });
    }

    selectStyle(styleId) {
        const styleCards = document.querySelectorAll('.style-card');
        styleCards.forEach((card, index) => {
            card.classList.remove('selected');
            if (index === 0 && styleId === 'casual') { // Casual & Natural es el primero
                card.classList.add('selected');
            }
        });
    }

    setupFormatSelection() {
        const formatOptions = document.querySelectorAll('.format-option');
        
        formatOptions.forEach(option => {
            option.addEventListener('click', () => {
                const formatId = option.getAttribute('data-format');
                this.selectFormat(formatId);
            });
        });
    }

    selectFormat(formatId) {
        // Remover selección previa
        document.querySelectorAll('.format-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // Seleccionar nuevo formato
        const selectedOption = document.querySelector(`[data-format="${formatId}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
        
        this.state.selectedFormat = formatId;
        this.updateProgress();
    }

    setupLocalizationSelection() {
        // País
        const countryItems = document.querySelectorAll('.select-item[data-country]');
        countryItems.forEach(item => {
            item.addEventListener('click', () => {
                const countryId = item.getAttribute('data-country');
                this.selectCountry(countryId);
            });
        });
        
        // Idioma
        const langItems = document.querySelectorAll('.select-item[data-lang]');
        langItems.forEach(item => {
            item.addEventListener('click', () => {
                const langId = item.getAttribute('data-lang');
                this.selectLanguage(langId);
            });
        });
        
        // Acento
        const accentItems = document.querySelectorAll('.select-item[data-accent]');
        accentItems.forEach(item => {
            item.addEventListener('click', () => {
                const accentId = item.getAttribute('data-accent');
                this.selectAccent(accentId);
            });
        });
    }

    selectCountry(countryId) {
        const items = document.querySelectorAll('.select-item[data-country]');
        items.forEach(item => {
            item.classList.remove('selected');
            if (item.getAttribute('data-country') === countryId) {
                item.classList.add('selected');
            }
        });
        
        this.state.selectedCountry = countryId;
        this.updateProgress();
    }

    selectLanguage(langId) {
        const items = document.querySelectorAll('.select-item[data-lang]');
        items.forEach(item => {
            item.classList.remove('selected');
            if (item.getAttribute('data-lang') === langId) {
                item.classList.add('selected');
            }
        });
        
        this.state.selectedLanguage = langId;
        this.updateProgress();
    }

    selectAccent(accentId) {
        const items = document.querySelectorAll('.select-item[data-accent]');
        items.forEach(item => {
            item.classList.remove('selected');
            if (item.getAttribute('data-accent') === accentId) {
                item.classList.add('selected');
            }
        });
        
        this.state.selectedAccent = accentId;
        this.updateProgress();
    }

    setupGenderSelection() {
        const toggleOptions = document.querySelectorAll('.toggle-option');
        
        toggleOptions.forEach(option => {
            option.addEventListener('click', () => {
                const genderId = option.getAttribute('data-gender');
                this.selectGender(genderId);
            });
        });
    }

    selectGender(genderId) {
        // Remover selección previa
        document.querySelectorAll('.toggle-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // Seleccionar género
        const selectedOption = document.querySelector(`[data-gender="${genderId}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
        
        this.state.selectedGender = genderId;
        this.updateProgress();
    }

    setupAgeSelection() {
        const ageChips = document.querySelectorAll('.age-chip');
        
        ageChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const ageRange = chip.getAttribute('data-age');
                this.toggleAge(ageRange);
            });
        });
    }

    toggleAge(ageRange) {
        const chip = document.querySelector(`[data-age="${ageRange}"]`);
        if (!chip) return;
        
        chip.classList.toggle('active');
        
        // Actualizar array de edades seleccionadas
        if (chip.classList.contains('active')) {
            if (!this.state.selectedAges.includes(ageRange)) {
                this.state.selectedAges.push(ageRange);
            }
        } else {
            this.state.selectedAges = this.state.selectedAges.filter(a => a !== ageRange);
        }
        
        this.updateProgress();
    }

    setupCreativitySlider() {
        const slider = document.getElementById('creativity-range');
        const valueDisplay = document.querySelector('.slider-value');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                valueDisplay.textContent = value;
                this.state.creativityLevel = value;
                this.updateProgress();
            });
            
            // Inicializar valor
            valueDisplay.textContent = slider.value;
        }
    }

    setupInlineForm() {
        const addBtn = document.querySelector('.btn-add');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.createNewOffer();
            });
        }
        
        // Envío con Enter
        const nameInput = document.querySelector('.form-input');
        const discountInput = document.querySelector('.form-input-small');
        
        [nameInput, discountInput].forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.createNewOffer();
                    }
                });
            }
        });
    }

    createNewOffer() {
        const nameInput = document.querySelector('.form-input');
        const discountInput = document.querySelector('.form-input-small');
        
        if (nameInput && discountInput && nameInput.value.trim() && discountInput.value.trim()) {
            this.showNotification('Oferta creada exitosamente', 'success');
            
            // Limpiar formulario
            nameInput.value = '';
            discountInput.value = '';
            
            this.state.selectedOffer = nameInput.value;
            this.updateProgress();
        } else {
            this.showNotification('Completa todos los campos de la oferta', 'error');
        }
    }

    setupActionButtons() {
        // Botón principal de generar
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.handleGenerateScripts();
            });
        }

        // Botón de guardar proyecto
        const saveBtn = document.querySelector('.btn-outline');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.handleSaveProject();
            });
        }

        // Botones "add new"
        const addNewBtns = document.querySelectorAll('.add-new-button');
        addNewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.querySelector('span').textContent;
                this.showNotification(`Función "${text}" próximamente disponible`);
            });
        });
    }

    /* =======================================
       Seguimiento de Progreso
       ======================================= */

    setupProgressTracking() {
        this.updateProgress();
    }

    updateProgress() {
        let completedItems = 0;
        const totalItems = 9; // Número de configuraciones principales
        
        // Verificar configuraciones completadas
        if (this.state.selectedBrand) completedItems++;
        if (this.state.selectedProduct) completedItems++;
        if (this.state.selectedCategory) completedItems++;
        if (this.state.selectedThemes.length > 0) completedItems++;
        if (this.state.selectedStyle) completedItems++;
        if (this.state.selectedFormat) completedItems++;
        if (this.state.selectedAges.length > 0) completedItems++;
        if (this.state.selectedGender) completedItems++;
        if (this.state.creativityLevel > 0) completedItems++;
        
        // Calcular porcentaje
        const percentage = Math.round((completedItems / totalItems) * 100);
        
        // Actualizar barra de progreso
        const progressFill = document.querySelector('.progress-fill');
        const progressPercentage = document.querySelector('.progress-percentage');
        
        if (progressFill && progressPercentage) {
            progressFill.style.width = `${percentage}%`;
            progressPercentage.textContent = `${percentage}%`;
        }
        
        this.state.progress = percentage;
        
        // Cambiar estado del botón si está completo
        this.updateGenerateButton();
    }

    updateGenerateButton() {
        const generateBtn = document.getElementById('generate-btn');
        if (!generateBtn) return;
        
        if (this.state.progress >= 80) {
            generateBtn.classList.add('ready');
            const span = generateBtn.querySelector('span');
            if (span && !span.textContent.includes('✓')) {
                span.textContent = '✓ ' + span.textContent;
            }
        }
    }

    /* =======================================
       Acciones Principales
       ======================================= */

    handleGenerateScripts() {
        // Validar configuración mínima
        if (!this.validateMinimalConfiguration()) {
            this.showNotification('Completa la configuración básica antes de generar', 'error');
            return;
        }
        
        // Mostrar proceso de generación
        this.showNotification('Generando guiones con IA...', 'success');
        
        // Simular proceso de generación
        const btn = document.getElementById('generate-btn');
        const originalHTML = btn.innerHTML;
        
        btn.innerHTML = '<i data-lucide="loader-2"></i><span>Generando...</span>';
        btn.disabled = true;
        lucide.createIcons();
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            lucide.createIcons();
            
            this.showNotification('¡Guiones generados exitosamente!', 'success');
            console.log('Navegando al Step 2 - Editor de Guiones');
        }, 3000);
    }

    handleSaveProject() {
        const projectData = this.collectProjectData();
        
        // Guardar en localStorage
        localStorage.setItem('ugc_studio_project', JSON.stringify(projectData));
        
        this.showNotification('Proyecto guardado correctamente', 'success');
    }

    validateMinimalConfiguration() {
        return (
            this.state.selectedBrand &&
            this.state.selectedProduct &&
            this.state.selectedCategory &&
            this.state.selectedThemes.length > 0
        );
    }

    collectProjectData() {
        return {
            ...this.state,
            timestamp: new Date().toISOString(),
            version: '2.0'
        };
    }

    /* =======================================
       Atajos de Teclado
       ======================================= */

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape - Cerrar panel activo
            if (e.key === 'Escape') {
                if (this.state.activeModal) {
                    this.closeModal(this.state.activeModal);
                }
            }
            
            // Ctrl/Cmd + S - Guardar proyecto
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.handleSaveProject();
            }
            
            // Ctrl/Cmd + Enter - Generar guiones
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.handleGenerateScripts();
            }
            
            // Números 1-5 para modales izquierdos
            if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.metaKey) {
                const modals = ['marca', 'producto', 'oferta', 'temas', 'categoria'];
                const modalIndex = parseInt(e.key) - 1;
                if (modals[modalIndex]) {
                    this.openModal(modals[modalIndex]);
                }
            }
            
            // Shift + números 1-8 para modales derechos
            if (e.shiftKey && e.key >= '1' && e.key <= '8') {
                const modals = ['estilos', 'formato', 'pais', 'idioma', 'acento', 'genero', 'edad', 'creatividad'];
                const modalIndex = parseInt(e.key) - 1;
                if (modals[modalIndex]) {
                    this.openModal(modals[modalIndex]);
                }
            }
        });
    }

    /* =======================================
       Sistema de Notificaciones
       ======================================= */

    showNotification(message, type = 'info') {
        // Remover notificación existente
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i data-lucide="${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Estilos cinematográficos
        Object.assign(notification.style, {
            position: 'fixed',
            top: '80px',
            right: '24px',
            padding: '12px 20px',
            borderRadius: '12px',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            zIndex: '9999',
            minWidth: '280px',
            backgroundColor: this.getNotificationColor(type),
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            transform: 'translateX(400px)',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center'
        });
        
        notification.querySelector('.notification-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        
        document.body.appendChild(notification);
        
        // Inicializar icono
        lucide.createIcons();
        
        // Animación de entrada
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto-remover después de 4 segundos
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 4000);
    }

    getNotificationIcon(type) {
        const icons = {
            info: 'info',
            success: 'check-circle',
            error: 'alert-circle',
            warning: 'alert-triangle'
        };
        return icons[type] || 'info';
    }

    getNotificationColor(type) {
        const colors = {
            info: 'rgba(59, 130, 246, 0.9)',
            success: 'rgba(16, 185, 129, 0.9)',
            error: 'rgba(239, 68, 68, 0.9)',
            warning: 'rgba(245, 158, 11, 0.9)'
        };
        return colors[type] || 'rgba(59, 130, 246, 0.9)';
    }
}

/* =======================================
   Inicialización
   ======================================= */

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.ugcStudio = new UGCStudioCinematic();
    console.log('UGC Studio Cinematográfico inicializado correctamente');
});

// Reinicializar iconos cuando sea necesario
window.addEventListener('load', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});