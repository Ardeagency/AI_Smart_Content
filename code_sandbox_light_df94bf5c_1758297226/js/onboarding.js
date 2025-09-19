// Onboarding Form JavaScript - Typeform Style

class OnboardingForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 25; // Ajustar según el número de preguntas del schema completo
        this.formData = {};
        this.isTransitioning = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateProgress();
        this.initializeFirstQuestion();
    }

    bindEvents() {
        // Navigation buttons
        const btnNext = document.getElementById('btnNext');
        const btnBack = document.getElementById('btnBack');
        const btnSkip = document.getElementById('btnSkip');

        btnNext.addEventListener('click', () => this.nextStep());
        btnBack.addEventListener('click', () => this.prevStep());
        btnSkip.addEventListener('click', () => this.skipToEnd());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isTransitioning) return;
            
            if (e.key === 'Enter' && !document.getElementById('btnNext').disabled) {
                e.preventDefault();
                this.nextStep();
            } else if (e.key === 'ArrowRight' && !document.getElementById('btnNext').disabled) {
                e.preventDefault();
                this.nextStep();
            } else if (e.key === 'ArrowLeft' && !document.getElementById('btnBack').disabled) {
                e.preventDefault();
                this.prevStep();
            }
        });

        // Form inputs
        this.bindInputEvents();
        this.bindOptionEvents();
    }

    bindInputEvents() {
        // Step 1: Nombre del producto
        const productNameInput = document.getElementById('nombre_producto');
        if (productNameInput) {
            productNameInput.addEventListener('input', (e) => {
                this.formData.nombre_producto = e.target.value.trim();
                this.validateCurrentStep();
            });

            productNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 7: Nombre de la marca
        const brandNameInput = document.getElementById('nombre_marca');
        if (brandNameInput) {
            brandNameInput.addEventListener('input', (e) => {
                this.formData.nombre_marca = e.target.value.trim();
                this.validateCurrentStep();
            });

            brandNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 4: Descripción del producto
        const descriptionInput = document.getElementById('descripcion');
        if (descriptionInput) {
            descriptionInput.addEventListener('input', (e) => {
                this.formData.descripcion = e.target.value.trim();
                this.updateCharCounter(e.target);
                this.validateCurrentStep();
            });

            descriptionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey && this.validateCurrentStep()) {
                    e.preventDefault();
                    this.nextStep();
                }
            });
        }

        // Step 5: Características principales
        const characteristics = ['caracteristica_1', 'caracteristica_2', 'caracteristica_3'];
        characteristics.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.formData[id] = e.target.value.trim();
                    this.validateCurrentStep();
                });

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const nextInput = document.getElementById(characteristics[index + 1]);
                        if (nextInput) {
                            nextInput.focus();
                        } else if (this.validateCurrentStep()) {
                            this.nextStep();
                        }
                    }
                });
            }
        });

        // Step 6: Beneficios
        const benefits = ['beneficio_1', 'beneficio_2', 'beneficio_3'];
        benefits.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.formData[id] = e.target.value.trim();
                    this.validateCurrentStep();
                });

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const nextInput = document.getElementById(benefits[index + 1]);
                        if (nextInput) {
                            nextInput.focus();
                        } else if (this.validateCurrentStep()) {
                            this.nextStep();
                        }
                    }
                });
            }
        });
    }

    bindOptionEvents() {
        // Option cards (grid style)
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectOption(card);
            });
        });

        // Option items (list style)
        document.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectOption(item);
            });
        });
    }

    selectOption(element) {
        const questionSlide = element.closest('.question-slide');
        const step = parseInt(questionSlide.dataset.step);
        const value = element.dataset.value;

        // Remove selection from siblings
        const siblings = element.parentNode.children;
        Array.from(siblings).forEach(sibling => {
            sibling.classList.remove('selected');
        });

        // Add selection to clicked element
        element.classList.add('selected');

        // Store data
        this.storeStepData(step, value);

        // Add ripple effect
        this.addRipple(element);

        // Auto-advance after short delay
        setTimeout(() => {
            if (step < this.totalSteps) {
                this.nextStep();
            }
        }, 600);
    }

    storeStepData(step, value) {
        const stepMapping = {
            2: 'tipo_producto',
            3: 'categoria',
            8: 'nicho_principal',
            9: 'plataforma_principal',
            10: 'estilo_contenido',
            11: 'filtros_preferidos',
            12: 'iluminacion',
            13: 'tipo_avatar'
        };

        const field = stepMapping[step];
        if (field) {
            this.formData[field] = value;
            const hiddenInput = document.getElementById(field);
            if (hiddenInput) {
                hiddenInput.value = value;
            }
        }

        this.updateNextButton();
        console.log('Form data updated:', this.formData);
    }

    validateCurrentStep() {
        let isValid = false;
        
        switch(this.currentStep) {
            case 1:
                isValid = this.validateStep1();
                break;
            case 4:
                isValid = this.validateStep4();
                break;
            case 5:
                isValid = this.validateStep5();
                break;
            case 6:
                isValid = this.validateStep6();
                break;
            case 7:
                isValid = this.validateStep7();
                break;
            default:
                // For option-based steps, check if an option is selected
                const currentSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);
                const selected = currentSlide?.querySelector('.selected');
                isValid = !!selected;
        }

        this.updateNextButton(isValid);
        return isValid;
    }

    validateStep1() {
        const productName = this.formData.nombre_producto || '';
        const isValid = productName.length >= 2;
        return isValid;
    }

    validateStep4() {
        const description = this.formData.descripcion || '';
        const isValid = description.length >= 20;
        return isValid;
    }

    validateStep5() {
        const char1 = this.formData.caracteristica_1 || '';
        const char2 = this.formData.caracteristica_2 || '';
        const char3 = this.formData.caracteristica_3 || '';
        const isValid = char1.length >= 3 && char2.length >= 3 && char3.length >= 3;
        return isValid;
    }

    validateStep6() {
        const ben1 = this.formData.beneficio_1 || '';
        const ben2 = this.formData.beneficio_2 || '';
        // beneficio_3 is optional
        const isValid = ben1.length >= 3 && ben2.length >= 3;
        return isValid;
    }

    validateStep7() {
        const brandName = this.formData.nombre_marca || '';
        const isValid = brandName.length >= 2;
        return isValid;
    }

    updateCharCounter(textarea) {
        const charCount = textarea.value.length;
        const maxLength = textarea.getAttribute('maxlength') || 500;
        const counter = document.getElementById('charCount');
        
        if (counter) {
            counter.textContent = charCount;
            
            // Update counter color based on usage
            counter.parentElement.classList.remove('warning', 'danger');
            if (charCount > maxLength * 0.8) {
                counter.parentElement.classList.add('warning');
            }
            if (charCount > maxLength * 0.95) {
                counter.parentElement.classList.add('danger');
            }
        }
    }

    updateNextButton(forceState = null) {
        const btnNext = document.getElementById('btnNext');
        let isValid = forceState !== null ? forceState : this.validateCurrentStep();

        btnNext.disabled = !isValid;
        
        if (isValid) {
            btnNext.style.opacity = '1';
            btnNext.style.transform = 'scale(1)';
        } else {
            btnNext.style.opacity = '0.5';
        }
    }

    nextStep() {
        if (this.isTransitioning || this.currentStep >= this.totalSteps) return;

        this.isTransitioning = true;
        this.currentStep++;
        this.transitionToStep('next');
    }

    prevStep() {
        if (this.isTransitioning || this.currentStep <= 1) return;

        this.isTransitioning = true;
        this.currentStep--;
        this.transitionToStep('prev');
    }

    transitionToStep(direction = 'next') {
        const currentSlide = document.querySelector('.question-slide.active');
        const nextSlide = document.querySelector(`.question-slide[data-step="${this.currentStep}"]`);

        if (!nextSlide) {
            this.isTransitioning = false;
            return;
        }

        // Animate out current slide
        currentSlide.style.transform = direction === 'next' ? 'translateX(-50px)' : 'translateX(50px)';
        currentSlide.style.opacity = '0';

        setTimeout(() => {
            // Hide current slide
            currentSlide.classList.remove('active');
            currentSlide.style.transform = '';
            currentSlide.style.opacity = '';

            // Show next slide
            nextSlide.style.transform = direction === 'next' ? 'translateX(50px)' : 'translateX(-50px)';
            nextSlide.style.opacity = '0';
            nextSlide.classList.add('active');

            // Animate in next slide
            setTimeout(() => {
                nextSlide.style.transform = 'translateX(0)';
                nextSlide.style.opacity = '1';

                // Focus first input if exists
                const firstInput = nextSlide.querySelector('input[type="text"], input[type="email"]');
                if (firstInput) {
                    setTimeout(() => firstInput.focus(), 300);
                }

                this.isTransitioning = false;
                this.updateProgress();
                this.updateNavigationButtons();
                this.updateNextButton();
            }, 50);
        }, 300);
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const currentStepEl = document.getElementById('currentStep');
        const totalStepsEl = document.getElementById('totalSteps');
        const timeEstimate = document.getElementById('timeEstimate');

        const progress = (this.currentStep / this.totalSteps) * 100;
        
        progressFill.style.width = `${progress}%`;
        currentStepEl.textContent = this.currentStep;
        totalStepsEl.textContent = this.totalSteps;

        // Update time estimate
        const remainingSteps = this.totalSteps - this.currentStep;
        const estimatedTime = Math.max(1, Math.ceil(remainingSteps * 0.3));
        timeEstimate.textContent = `${estimatedTime} min restantes`;
    }

    updateNavigationButtons() {
        const btnBack = document.getElementById('btnBack');
        const btnNext = document.getElementById('btnNext');

        // Back button
        btnBack.disabled = this.currentStep <= 1;

        // Next button text
        if (this.currentStep === this.totalSteps) {
            btnNext.innerHTML = `
                Completar Setup
                <i class="fas fa-check"></i>
            `;
        } else {
            btnNext.innerHTML = `
                Continuar
                <i class="fas fa-arrow-right"></i>
            `;
        }
    }

    initializeFirstQuestion() {
        const firstSlide = document.querySelector('.question-slide[data-step="1"]');
        if (firstSlide) {
            firstSlide.classList.add('active');
            
            // Focus first input
            setTimeout(() => {
                const firstInput = firstSlide.querySelector('input');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 500);
        }
        
        this.updateNavigationButtons();
        this.updateNextButton();
    }

    addRipple(element) {
        const ripple = document.createElement('div');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: 50%;
            top: 50%;
            background: rgba(253, 98, 79, 0.4);
            border-radius: 50%;
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.8s ease-out;
            pointer-events: none;
            z-index: 10;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.remove();
            }
        }, 800);
    }

    skipToEnd() {
        // Show confirmation modal
        this.showSkipConfirmation();
    }

    showSkipConfirmation() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        modal.innerHTML = `
            <div style="
                background: var(--bg-card);
                border: 2px solid var(--primary-color);
                border-radius: 20px;
                padding: 2.5rem;
                max-width: 400px;
                text-align: center;
                transform: scale(0.9);
                transition: transform 0.3s ease;
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, var(--warning-color), #f59e0b);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    font-size: 1.5rem;
                    color: white;
                ">
                    <i class="fas fa-exclamation"></i>
                </div>
                <h3 style="
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 1rem;
                    color: var(--text-primary);
                ">¿Completar después?</h3>
                <p style="
                    color: var(--text-secondary);
                    margin-bottom: 2rem;
                    line-height: 1.6;
                ">Puedes personalizar tu experiencia más tarde desde tu dashboard, pero tendrás una configuración básica por ahora.</p>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn-cancel" style="
                        flex: 1;
                        background: transparent;
                        color: var(--text-secondary);
                        border: 2px solid rgba(255, 255, 255, 0.2);
                        padding: 0.75rem 1.5rem;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">Continuar Setup</button>
                    <button class="btn-confirm" style="
                        flex: 1;
                        background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">Sí, completar después</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.querySelector('div').style.transform = 'scale(1)';
        }, 10);

        // Event listeners
        const btnCancel = modal.querySelector('.btn-cancel');
        const btnConfirm = modal.querySelector('.btn-confirm');

        btnCancel.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        btnConfirm.addEventListener('click', () => {
            this.completeOnboarding(true);
        });

        // Add hover effects
        btnCancel.addEventListener('mouseenter', () => {
            btnCancel.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            btnCancel.style.color = 'var(--text-primary)';
        });

        btnCancel.addEventListener('mouseleave', () => {
            btnCancel.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            btnCancel.style.color = 'var(--text-secondary)';
        });

        btnConfirm.addEventListener('mouseenter', () => {
            btnConfirm.style.transform = 'translateY(-2px)';
        });

        btnConfirm.addEventListener('mouseleave', () => {
            btnConfirm.style.transform = 'translateY(0)';
        });
    }

    completeOnboarding(skipped = false) {
        // Store form data (in real app, send to backend)
        console.log('Onboarding completed:', {
            formData: this.formData,
            completed: !skipped,
            skipped: skipped
        });

        // Show completion modal
        this.showCompletionModal(skipped);
    }

    showCompletionModal(skipped = false) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(15px);
            z-index: 1001;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.4s ease;
        `;

        const title = skipped ? '¡Listo para comenzar!' : '¡Configuración completa!';
        const subtitle = skipped ? 
            'Tu cuenta está lista con configuración básica' : 
            'Tu perfil está perfectamente configurado para generar UGC increíble';

        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, var(--bg-card), #0a0a0a);
                border: 2px solid var(--primary-color);
                border-radius: 24px;
                padding: 3rem;
                max-width: 500px;
                text-align: center;
                transform: scale(0.8);
                transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            ">
                <div style="
                    width: 100px;
                    height: 100px;
                    background: linear-gradient(135deg, var(--success-color), #10b981);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 2rem;
                    font-size: 2.5rem;
                    color: white;
                    animation: successPulse 2s ease-in-out infinite;
                ">
                    <i class="fas fa-${skipped ? 'rocket' : 'check'}"></i>
                </div>
                <h2 style="
                    font-size: 2.2rem;
                    font-weight: 800;
                    margin-bottom: 1rem;
                    background: linear-gradient(135deg, var(--text-primary), var(--primary-color));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                ">${title}</h2>
                <p style="
                    font-size: 1.2rem;
                    color: var(--text-secondary);
                    margin-bottom: 2.5rem;
                    line-height: 1.6;
                ">${subtitle}</p>
                
                <div style="
                    background: rgba(253, 98, 79, 0.1);
                    border: 1px solid rgba(253, 98, 79, 0.3);
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin-bottom: 2.5rem;
                ">
                    <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">¿Qué sigue?</h3>
                    <p style="color: var(--text-secondary); margin: 0; font-size: 0.95rem;">
                        Te llevaremos a tu dashboard donde podrás comenzar a generar tu primer UGC
                    </p>
                </div>
                
                <button style="
                    background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
                    color: white;
                    border: none;
                    padding: 1.25rem 2.5rem;
                    border-radius: 12px;
                    font-size: 1.1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.75rem;
                " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 20px 60px rgba(253, 98, 79, 0.4)'"
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'"
                   onclick="window.location.href='dashboard.html'">
                    <i class="fas fa-rocket"></i>
                    Ir al Dashboard
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Add animation styles
        if (!document.getElementById('success-pulse-animation')) {
            const style = document.createElement('style');
            style.id = 'success-pulse-animation';
            style.textContent = `
                @keyframes successPulse {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(16, 185, 129, 0); }
                }
            `;
            document.head.appendChild(style);
        }

        // Animate in
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.querySelector('div').style.transform = 'scale(1)';
        }, 100);
    }
}

// Add ripple animation styles
if (!document.getElementById('onboarding-animations')) {
    const style = document.createElement('style');
    style.id = 'onboarding-animations';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: translate(-50%, -50%) scale(2);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    new OnboardingForm();
});