// ===== CREAR UGC - JAVASCRIPT =====

// Configuración global
const CrearUGC = {
    // Estado de la aplicación
    state: {
        currentStep: 1,
        selectedProduct: null,
        selectedAvatar: null,
        ugcType: 'video',
        format: '1080x1920',
        style: 'nike',
        platforms: ['instagram', 'tiktok'],
        language: 'es',
        description: '',
        isGenerating: false
    },

    // Inicialización
    init() {
        this.bindEvents();
        this.updateProgress();
    },

    // Event listeners
    bindEvents() {
        // Selección de productos
        document.querySelectorAll('.product-select-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!card.classList.contains('add-product')) {
                    this.selectProduct(card);
                }
            });
        });

        // Selección de avatares
        document.querySelectorAll('.avatar-select-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!card.classList.contains('add-avatar')) {
                    this.selectAvatar(card);
                }
            });
        });

        // Configuración de UGC
        document.querySelectorAll('input[name="ugc-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.state.ugcType = e.target.value;
                this.updateSummary();
            });
        });

        document.querySelectorAll('input[name="format"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.state.format = e.target.value;
                this.updateSummary();
            });
        });

        // Estilo
        const styleSelect = document.querySelector('select');
        if (styleSelect) {
            styleSelect.addEventListener('change', (e) => {
                this.state.style = e.target.value;
                this.updateSummary();
            });
        }

        // Plataformas
        document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updatePlatforms();
            });
        });

        // Idioma
        const languageSelect = document.querySelectorAll('select')[1];
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                this.state.language = e.target.value;
                this.updateSummary();
            });
        });

        // Descripción
        const descriptionTextarea = document.querySelector('textarea');
        if (descriptionTextarea) {
            descriptionTextarea.addEventListener('input', (e) => {
                this.state.description = e.target.value;
            });
        }

        // Botones de navegación
        document.querySelectorAll('.step-actions button').forEach(button => {
            button.addEventListener('click', (e) => {
                if (e.target.textContent.includes('Siguiente')) {
                    this.nextStep();
                } else if (e.target.textContent.includes('Anterior')) {
                    this.prevStep();
                }
            });
        });

        // Botón de generar
        const generateBtn = document.querySelector('.btn-generate');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateUGC();
            });
        }
    },

    // Seleccionar producto
    selectProduct(card) {
        // Deseleccionar otros productos
        document.querySelectorAll('.product-select-card').forEach(c => {
            c.classList.remove('active');
        });
        
        // Seleccionar producto actual
        card.classList.add('active');
        
        // Actualizar estado
        const productId = card.dataset.product;
        const productName = card.querySelector('.product-name').textContent;
        this.state.selectedProduct = { id: productId, name: productName };
        
        // Habilitar siguiente paso
        this.updateStepButtons();
        this.updateSummary();
    },

    // Seleccionar avatar
    selectAvatar(card) {
        // Deseleccionar otros avatares
        document.querySelectorAll('.avatar-select-card').forEach(c => {
            c.classList.remove('active');
        });
        
        // Seleccionar avatar actual
        card.classList.add('active');
        
        // Actualizar estado
        const avatarId = card.dataset.avatar;
        const avatarName = card.querySelector('.avatar-name').textContent;
        this.state.selectedAvatar = { id: avatarId, name: avatarName };
        
        // Habilitar siguiente paso
        this.updateStepButtons();
        this.updateSummary();
    },

    // Actualizar plataformas
    updatePlatforms() {
        const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
        this.state.platforms = Array.from(checkboxes).map(cb => cb.nextElementSibling.textContent.toLowerCase());
        this.updateSummary();
    },

    // Siguiente paso
    nextStep() {
        if (this.state.currentStep < 4) {
            this.state.currentStep++;
            this.updateStep();
            this.updateProgress();
        }
    },

    // Paso anterior
    prevStep() {
        if (this.state.currentStep > 1) {
            this.state.currentStep--;
            this.updateStep();
            this.updateProgress();
        }
    },

    // Actualizar paso
    updateStep() {
        // Ocultar todos los pasos
        document.querySelectorAll('.create-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Mostrar paso actual
        document.getElementById(`step-${this.state.currentStep}`).classList.add('active');
        
        // Actualizar botones
        this.updateStepButtons();
    },

    // Actualizar botones de paso
    updateStepButtons() {
        const currentStep = document.getElementById(`step-${this.state.currentStep}`);
        const prevBtn = currentStep.querySelector('.btn-secondary');
        const nextBtn = currentStep.querySelector('.btn-primary');
        
        // Botón anterior
        if (prevBtn) {
            prevBtn.disabled = this.state.currentStep === 1;
        }
        
        // Botón siguiente
        if (nextBtn) {
            const canProceed = this.canProceedToNextStep();
            nextBtn.disabled = !canProceed;
            
            if (this.state.currentStep === 4) {
                nextBtn.innerHTML = '<i class="fas fa-magic"></i><span>Generar UGC</span>';
            } else {
                nextBtn.innerHTML = 'Siguiente';
            }
        }
    },

    // Verificar si puede proceder al siguiente paso
    canProceedToNextStep() {
        switch(this.state.currentStep) {
            case 1:
                return this.state.selectedProduct !== null;
            case 2:
                return this.state.selectedAvatar !== null;
            case 3:
                return true; // La configuración siempre es válida
            case 4:
                return true;
            default:
                return false;
        }
    },

    // Actualizar progreso
    updateProgress() {
        document.querySelectorAll('.progress-step').forEach((step, index) => {
            const stepNumber = index + 1;
            if (stepNumber < this.state.currentStep) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (stepNumber === this.state.currentStep) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    },

    // Actualizar resumen
    updateSummary() {
        const summaryCard = document.querySelector('.summary-card');
        if (!summaryCard) return;
        
        // Actualizar valores en el resumen
        const productValue = summaryCard.querySelector('.summary-item:nth-child(1) .summary-value');
        if (productValue && this.state.selectedProduct) {
            productValue.textContent = this.state.selectedProduct.name;
        }
        
        const avatarValue = summaryCard.querySelector('.summary-item:nth-child(2) .summary-value');
        if (avatarValue && this.state.selectedAvatar) {
            avatarValue.textContent = this.state.selectedAvatar.name;
        }
        
        const typeValue = summaryCard.querySelector('.summary-item:nth-child(3) .summary-value');
        if (typeValue) {
            typeValue.textContent = this.state.ugcType.charAt(0).toUpperCase() + this.state.ugcType.slice(1);
        }
        
        const formatValue = summaryCard.querySelector('.summary-item:nth-child(4) .summary-value');
        if (formatValue) {
            formatValue.textContent = `${this.state.format} (Stories)`;
        }
        
        const styleValue = summaryCard.querySelector('.summary-item:nth-child(5) .summary-value');
        if (styleValue) {
            const styleNames = {
                'nike': 'Nike - Deportivo',
                'apple': 'Apple - Minimalista',
                'vicio': 'Vicio - Irreverente',
                'custom': 'Personalizado'
            };
            styleValue.textContent = styleNames[this.state.style] || this.state.style;
        }
        
        const platformsValue = summaryCard.querySelector('.summary-item:nth-child(6) .summary-value');
        if (platformsValue) {
            platformsValue.textContent = this.state.platforms.map(p => 
                p.charAt(0).toUpperCase() + p.slice(1)
            ).join(', ');
        }
    },

    // Generar UGC
    generateUGC() {
        if (this.state.isGenerating) return;
        
        this.state.isGenerating = true;
        this.showGenerationModal();
        this.startGenerationProcess();
    },

    // Mostrar modal de generación
    showGenerationModal() {
        const modal = document.getElementById('generation-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('fade-in');
        }
    },

    // Ocultar modal de generación
    hideGenerationModal() {
        const modal = document.getElementById('generation-modal');
        if (modal) {
            modal.classList.remove('fade-in');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    },

    // Iniciar proceso de generación
    startGenerationProcess() {
        const steps = [
            { text: 'Procesando configuración...', duration: 2000 },
            { text: 'Aplicando estilo visual...', duration: 3000 },
            { text: 'Generando contenido...', duration: 4000 },
            { text: 'Finalizando...', duration: 1000 }
        ];
        
        let currentStep = 0;
        let progress = 0;
        
        const updateProgress = () => {
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            const generationSteps = document.querySelectorAll('.generation-step');
            
            if (currentStep < steps.length) {
                const step = steps[currentStep];
                const stepProgress = (progress / step.duration) * 100;
                
                if (progressFill) {
                    progressFill.style.width = `${(currentStep / steps.length) * 100 + (stepProgress / steps.length)}%`;
                }
                
                if (progressText) {
                    progressText.textContent = step.text;
                }
                
                if (generationSteps[currentStep]) {
                    generationSteps[currentStep].classList.add('active');
                }
                
                progress += 100;
                
                if (progress >= step.duration) {
                    currentStep++;
                    progress = 0;
                }
                
                if (currentStep < steps.length) {
                    setTimeout(updateProgress, 100);
                } else {
                    this.completeGeneration();
                }
            }
        };
        
        updateProgress();
    },

    // Completar generación
    completeGeneration() {
        setTimeout(() => {
            this.hideGenerationModal();
            this.showSuccessMessage();
            this.state.isGenerating = false;
        }, 1000);
    },

    // Mostrar mensaje de éxito
    showSuccessMessage() {
        const alert = document.createElement('div');
        alert.className = 'alert alert-success';
        alert.innerHTML = `
            <i class="fas fa-check-circle alert-icon"></i>
            <span>¡UGC generado exitosamente! Puedes verlo en la sección "Mis UGCs".</span>
        `;
        
        document.querySelector('.create-content').insertBefore(alert, document.querySelector('.create-step'));
        
        // Remover alerta después de 5 segundos
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
};

// Funciones globales
function nextStep() {
    CrearUGC.nextStep();
}

function prevStep() {
    CrearUGC.prevStep();
}

function generateUGC() {
    CrearUGC.generateUGC();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    CrearUGC.init();
});

// Animaciones CSS adicionales
const style = document.createElement('style');
style.textContent = `
    .create-step {
        display: none;
    }
    
    .create-step.active {
        display: block;
        animation: fadeInUp 0.5s ease-out;
    }
    
    .product-select-card,
    .avatar-select-card {
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .product-select-card:hover,
    .avatar-select-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 32px rgba(253, 98, 79, 0.2);
    }
    
    .product-select-card.active,
    .avatar-select-card.active {
        border-color: var(--color-secondary);
        background: rgba(253, 98, 79, 0.1);
    }
    
    .progress-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--spacing-xs);
    }
    
    .progress-step.active .step-number {
        background: var(--color-secondary);
        color: var(--color-white);
    }
    
    .progress-step.completed .step-number {
        background: #22c55e;
        color: var(--color-white);
    }
    
    .step-number {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-medium-gray);
        color: var(--color-light-gray);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: var(--font-weight-bold);
        transition: all 0.3s ease;
    }
    
    .progress-line {
        width: 100px;
        height: 2px;
        background: var(--color-medium-gray);
        margin: 0 var(--spacing-sm);
    }
    
    .progress-step.completed + .progress-line {
        background: #22c55e;
    }
    
    .option-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        border: 1px solid var(--color-medium-gray);
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .option-item:hover {
        border-color: var(--color-secondary);
        background: rgba(253, 98, 79, 0.05);
    }
    
    .option-item input[type="radio"]:checked + .option-content {
        color: var(--color-secondary);
    }
    
    .option-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--spacing-xs);
    }
    
    .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    }
    
    .modal-content {
        background: var(--color-dark-gray);
        border-radius: var(--border-radius-lg);
        padding: var(--spacing-xl);
        max-width: 500px;
        width: 90%;
        border: 1px solid var(--color-medium-gray);
    }
    
    .modal-header {
        margin-bottom: var(--spacing-lg);
        text-align: center;
    }
    
    .modal-title {
        color: var(--color-white);
        font-size: 1.5rem;
        font-weight: var(--font-weight-bold);
    }
    
    .generation-progress {
        margin-bottom: var(--spacing-lg);
    }
    
    .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--color-medium-gray);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: var(--spacing-sm);
    }
    
    .progress-fill {
        height: 100%;
        background: var(--gradient-primary);
        width: 0%;
        transition: width 0.3s ease;
    }
    
    .progress-text {
        text-align: center;
        color: var(--color-light-gray);
        font-size: 0.9rem;
    }
    
    .generation-steps {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
    }
    
    .generation-step {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        border-radius: var(--border-radius);
        color: var(--color-light-gray);
        transition: all 0.3s ease;
    }
    
    .generation-step.active {
        background: rgba(253, 98, 79, 0.1);
        color: var(--color-secondary);
    }
    
    .generation-step i {
        width: 20px;
        text-align: center;
    }
    
    .fa-spin {
        animation: spin 1s linear infinite;
    }
    
    .fade-in {
        animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(style);
