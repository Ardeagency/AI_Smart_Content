// Payment Modal JavaScript - Registro de Usuario y Pago con Wompi

class PaymentModal {
    constructor() {
        this.isOpen = false;
        this.selectedMethod = 'wompi'; // Único método de pago disponible (Beta)
        this.selectedPlan = null;
        this.isProcessing = false;
        this.init();
    }

    init() {
        this.createModal();
        this.bindEvents();
    }

    createModal() {
        // Remove any existing payment modal first
        const existingModal = document.getElementById('paymentOverlay');
        if (existingModal) {
            console.log('🗑️ Eliminando modal existente');
            existingModal.remove();
        }
        
        // Remove any other modals that might conflict
        const allModals = document.querySelectorAll('.payment-overlay, .modal-overlay, [id*="modal"], [class*="modal"]');
        allModals.forEach(modal => {
            if (modal.innerHTML && (modal.innerHTML.includes('PayPal') || modal.innerHTML.includes('Apple Pay'))) {
                console.log('🗑️ Eliminando modal conflictivo:', modal);
                modal.remove();
            }
        });
        
        console.log('🔄 Creando nuevo modal de Wompi...');
        
        // Create modal HTML
        const modalHTML = `
            <div class="payment-overlay" id="paymentOverlay">
                <div class="payment-modal">
                    <div class="payment-header">
                        <button class="payment-close" id="paymentClose">
                            <i class="fas fa-times"></i>
                        </button>
                        <div class="plan-selected" id="planSelected">
                            <i class="fas fa-crown"></i>
                            <span id="selectedPlanName">Plan Seleccionado</span>
                        </div>
                        <h2 class="payment-title">Crear tu Cuenta</h2>
                        <p class="payment-subtitle">Únete a AI Smart Content y comienza a crear contenido profesional</p>
                        <div class="price-display">
                            <div class="price-amount" id="priceAmount">$79.000</div>
                            <div class="price-period">COP / mes</div>
                        </div>
                    </div>

                    <div class="payment-body">
                        <!-- Registration Form -->
                        <div class="registration-form" id="registrationForm">
                            <div class="form-section">
                                <h3 class="section-title">
                                    <i class="fas fa-user"></i>
                                    Información Personal
                                </h3>
                                
                                <div class="form-group">
                                    <label class="form-label">Nombre Completo *</label>
                                    <input type="text" class="form-input" placeholder="Ej: María José García" id="fullNameInput" required>
                                    <div class="field-error" id="fullNameError"></div>
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label">Email *</label>
                                    <input type="email" class="form-input" placeholder="tu@email.com" id="emailInput" required>
                                    <div class="field-error" id="emailError"></div>
                                </div>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Contraseña *</label>
                                        <div class="password-input">
                                            <input type="password" class="form-input" placeholder="Mínimo 8 caracteres" id="passwordInput" required>
                                            <button type="button" class="password-toggle" id="passwordToggle">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </div>
                                        <div class="field-error" id="passwordError"></div>
                                        <div class="password-strength" id="passwordStrength"></div>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Confirmar Contraseña *</label>
                                        <div class="password-input">
                                            <input type="password" class="form-input" placeholder="Repetir contraseña" id="confirmPasswordInput" required>
                                            <button type="button" class="password-toggle" id="confirmPasswordToggle">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </div>
                                        <div class="field-error" id="confirmPasswordError"></div>
                                    </div>
                                </div>
                            </div>

                            <div class="form-section">
                                <h3 class="section-title">
                                    <i class="fas fa-credit-card"></i>
                                    Método de Pago
                                </h3>
                                
                                <!-- Wompi Payment Method (Fixed - Beta Version) -->
                                <div class="payment-method-fixed">
                                    <div class="wompi-badge">
                                        <div class="wompi-logo">
                                            <img src="https://wompi.co/wp-content/uploads/2021/06/Logo-Wompi-Morado.png" alt="Wompi" style="height: 24px;">
                                        </div>
                                        <div class="wompi-info">
                                            <div class="wompi-name">Wompi</div>
                                            <div class="wompi-description">Pagos seguros en Colombia</div>
                                        </div>
                                        <div class="beta-badge">BETA</div>
                                    </div>
                                    <div class="wompi-features">
                                        <div class="feature">✓ Tarjetas de crédito y débito</div>
                                        <div class="feature">✓ PSE y transferencias bancarias</div>
                                        <div class="feature">✓ Pagos seguros en pesos colombianos</div>
                                        <div class="feature">✓ Procesamiento inmediato</div>
                                    </div>
                                    <div class="wompi-note">
                                        <i class="fas fa-info-circle"></i>
                                        <span>Único método de pago disponible durante la fase Beta</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Security Badges -->
                        <div class="security-badges">
                            <div class="security-badge">
                                <i class="fas fa-shield-alt"></i>
                                <span>SSL Seguro</span>
                            </div>
                            <div class="security-badge">
                                <i class="fas fa-lock"></i>
                                <span>256-bit Encryption</span>
                            </div>
                            <div class="security-badge">
                                <i class="fas fa-university"></i>
                                <span>Wompi Secure</span>
                            </div>
                        </div>

                        <!-- Plan Features Summary -->
                        <div class="plan-features-summary" id="planFeaturesSummary">
                            <h4 class="features-title">
                                <i class="fas fa-star"></i>
                                Incluido en tu plan
                            </h4>
                            <div class="features-list" id="featuresList">
                                <!-- Features will be populated dynamically -->
                            </div>
                        </div>

                        <!-- Payment Summary -->
                        <div class="payment-total">
                            <div class="total-row">
                                <span class="total-label">Plan <span id="planNameSummary">Pro</span></span>
                                <span class="total-amount" id="planPrice">Gratis</span>
                            </div>
                            <div class="total-row">
                                <span class="total-label">Periodo de prueba</span>
                                <span class="total-amount">7 días gratis</span>
                            </div>
                            <div class="total-row">
                                <span class="total-label">Después del periodo</span>
                                <span class="total-amount" id="futurePrice">Gratis por tiempo limitado</span>
                            </div>
                            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 1rem 0;">
                            <div class="total-row final">
                                <span class="total-label">Total a Pagar Hoy</span>
                                <span class="total-amount" id="finalTotal">$0 COP</span>
                            </div>
                        </div>

                        <!-- Registration Actions -->
                        <div class="payment-actions">
                            <button class="pay-button" id="registerButton">
                                <div class="spinner"></div>
                                <span class="pay-text">
                                    <i class="fas fa-user-plus"></i>
                                    Crear Cuenta y Pagar
                                </span>
                            </button>
                            <button class="cancel-button" id="cancelPayment">Cancelar</button>
                        </div>

                        <!-- Terms and Conditions -->
                        <div class="payment-disclaimer">
                            <label class="checkbox-container">
                                <input type="checkbox" id="acceptTerms" required>
                                <span class="checkmark"></span>
                                Acepto los <a href="#" target="_blank">Términos de Servicio</a> y la <a href="#" target="_blank">Política de Privacidad</a>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add to document
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Verify the modal was created correctly
        const createdModal = document.getElementById('paymentOverlay');
        if (createdModal) {
            console.log('✅ Modal creado exitosamente');
            console.log('📋 Contenido verificado:', {
                hasWompi: createdModal.innerHTML.includes('Wompi'),
                hasPaypal: createdModal.innerHTML.includes('PayPal'),
                hasApplePay: createdModal.innerHTML.includes('Apple Pay'),
                hasGooglePay: createdModal.innerHTML.includes('Google Pay'),
                hasWompiFixed: createdModal.innerHTML.includes('payment-method-fixed')
            });
        } else {
            console.error('❌ Error: Modal no fue creado');
        }
    }

    bindEvents() {
        // Close modal events
        const overlay = document.getElementById('paymentOverlay');
        const closeBtn = document.getElementById('paymentClose');
        const cancelBtn = document.getElementById('cancelPayment');

        closeBtn.addEventListener('click', () => this.close());
        cancelBtn.addEventListener('click', () => this.close());
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        // Register button
        const registerButton = document.getElementById('registerButton');
        registerButton.addEventListener('click', () => this.processRegistration());

        // Password toggle functionality
        this.setupPasswordToggles();

        // Form validation
        this.setupFormValidation();

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    open(planData) {
        console.log('📱 Abriendo modal con plan:', planData);
        this.selectedPlan = planData;
        this.updateModalContent();
        
        const overlay = document.getElementById('paymentOverlay');
        console.log('🎯 Overlay encontrado:', overlay);
        
        if (overlay) {
            // Log current styles
            console.log('📊 Estilos actuales del overlay:', {
                display: getComputedStyle(overlay).display,
                position: getComputedStyle(overlay).position,
                zIndex: getComputedStyle(overlay).zIndex,
                opacity: getComputedStyle(overlay).opacity,
                visibility: getComputedStyle(overlay).visibility
            });
            
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.isOpen = true;
            
            console.log('✅ Modal activado, clases:', overlay.className);

        // Focus first input
        setTimeout(() => {
                const firstInput = document.getElementById('fullNameInput');
            if (firstInput) firstInput.focus();
        }, 400);
        } else {
            console.error('❌ No se encontró el overlay del payment modal');
        }
    }

    close() {
        const overlay = document.getElementById('paymentOverlay');
        if (overlay) {
        overlay.classList.remove('active');
        }
        document.body.style.overflow = '';
        this.isOpen = false;
        
        // Clean up any lingering modals after close animation
        setTimeout(() => {
            const allPaymentModals = document.querySelectorAll('[id*="payment"], [class*="payment-overlay"]');
            allPaymentModals.forEach(modal => {
                if (modal.innerHTML && (modal.innerHTML.includes('PayPal') || modal.innerHTML.includes('Apple Pay'))) {
                    console.log('🧹 Limpiando modal antiguo:', modal);
                    modal.remove();
                }
            });
        }, 400);
    }

    updateModalContent() {
        if (!this.selectedPlan) return;

        const planNameEl = document.getElementById('selectedPlanName');
        const priceAmountEl = document.getElementById('priceAmount');
        const planNameSummaryEl = document.getElementById('planNameSummary');
        const planPriceEl = document.getElementById('planPrice');
        const finalTotalEl = document.getElementById('finalTotal');

        // Plan prices in COP (Colombian Pesos) - Updated for 2024
        const planPrices = {
            'starter': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 49000,
                period: '/mes',
                savings: 'Gratis por tiempo limitado'
            },
            'pro': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 149000,
                period: '/mes',
                savings: 'Gratis por tiempo limitado',
                popular: true
            },
            'enterprise': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 299000,
                period: '/mes',
                savings: 'Gratis por tiempo limitado'
            }
        };

        const currentPlan = planPrices[this.selectedPlan.type] || planPrices['pro'];

        // Update plan information
        planNameEl.textContent = this.selectedPlan.name;
        planNameSummaryEl.textContent = this.selectedPlan.name;
        
        // Update pricing display
        if (currentPlan.amount === 0) {
            priceAmountEl.textContent = 'Gratis';
            priceAmountEl.style.fontSize = '1.5rem';
        } else {
            priceAmountEl.textContent = `$${(currentPlan.amount / 1000).toFixed(0)}K`;
            priceAmountEl.style.fontSize = '2rem';
        }
        
        // Update period
        const periodEl = document.querySelector('.price-period');
        if (periodEl) {
            periodEl.textContent = currentPlan.amount === 0 ? 'Por tiempo limitado' : `COP ${currentPlan.period}`;
        }
        
        // Update summary pricing
        planPriceEl.textContent = currentPlan.display;
        finalTotalEl.textContent = currentPlan.display;

        // Add savings indicator for free plans
        if (currentPlan.amount === 0 && currentPlan.originalPrice > 0) {
            const savingsText = `(Valor normal: $${(currentPlan.originalPrice / 1000).toFixed(0)}K COP/mes)`;
            planPriceEl.innerHTML = `${currentPlan.display} <small style="color: var(--text-muted); display: block; font-size: 0.8rem;">${savingsText}</small>`;
        }

        // Update plan selected badge color and popular indicator
        const planSelectedEl = document.getElementById('planSelected');
        planSelectedEl.className = `plan-selected ${this.selectedPlan.type}`;
        
        // Add popular badge if applicable
        if (currentPlan.popular) {
            const popularBadge = document.createElement('span');
            popularBadge.className = 'popular-indicator';
            popularBadge.innerHTML = '⭐ Más Popular';
            popularBadge.style.cssText = `
                background: linear-gradient(45deg, #f59e0b, #d97706);
                color: white;
                padding: 0.25rem 0.5rem;
                border-radius: 10px;
                font-size: 0.7rem;
                margin-left: 0.5rem;
                font-weight: 600;
            `;
            planSelectedEl.appendChild(popularBadge);
        }
        
        // Update plan features
        this.updatePlanFeatures(this.selectedPlan.type);
    }
    
    updatePlanFeatures(planType) {
        const featuresListEl = document.getElementById('featuresList');
        if (!featuresListEl) return;
        
        // Define features for each plan
        const planFeatures = {
            'starter': [
                { icon: 'fas fa-play-circle', text: '1 UGC por ejecución' },
                { icon: 'fas fa-video', text: '1 Video HD' },
                { icon: 'fas fa-image', text: '1 Imagen optimizada' },
                { icon: 'fas fa-user', text: '1 Avatar personalizado' },
                { icon: 'fas fa-cogs', text: 'IA Veo 3 + NanoBanana + Seedream' }
            ],
            'pro': [
                { icon: 'fas fa-play-circle', text: '3 UGC por ejecución' },
                { icon: 'fas fa-video', text: '3 Videos HD' },
                { icon: 'fas fa-image', text: '3 Imágenes optimizadas' },
                { icon: 'fas fa-user', text: '1 Avatar personalizado' },
                { icon: 'fas fa-cogs', text: 'IA Veo 3 + NanoBanana + Seedream' },
                { icon: 'fas fa-chart-line', text: 'A/B Testing integrado' }
            ],
            'enterprise': [
                { icon: 'fas fa-play-circle', text: '6 UGC por ejecución' },
                { icon: 'fas fa-video', text: '6 Videos HD' },
                { icon: 'fas fa-image', text: '6 Imágenes optimizadas' },
                { icon: 'fas fa-user', text: '1 Avatar personalizado' },
                { icon: 'fas fa-cogs', text: 'IA Veo 3 + NanoBanana + Seedream' },
                { icon: 'fas fa-chart-line', text: 'Análisis avanzado' },
                { icon: 'fas fa-layer-group', text: 'Múltiples formatos' }
            ]
        };
        
        const currentFeatures = planFeatures[planType] || planFeatures['pro'];
        
        // Clear existing features
        featuresListEl.innerHTML = '';
        
        // Add features
        currentFeatures.forEach(feature => {
            const featureEl = document.createElement('div');
            featureEl.className = 'feature-item';
            featureEl.innerHTML = `
                <i class="${feature.icon}"></i>
                <span>${feature.text}</span>
            `;
            featuresListEl.appendChild(featureEl);
        });
        
        // Update future pricing
        const futurePriceEl = document.getElementById('futurePrice');
        if (futurePriceEl) {
            const planPrices = {
                'starter': { originalPrice: 49000 },
                'pro': { originalPrice: 149000 },
                'enterprise': { originalPrice: 299000 }
            };
            
            const planPrice = planPrices[planType] || planPrices['pro'];
            futurePriceEl.textContent = `$${(planPrice.originalPrice / 1000).toFixed(0)}K COP/mes`;
        }
    }

    setupPasswordToggles() {
        const passwordToggle = document.getElementById('passwordToggle');
        const confirmPasswordToggle = document.getElementById('confirmPasswordToggle');
        const passwordInput = document.getElementById('passwordInput');
        const confirmPasswordInput = document.getElementById('confirmPasswordInput');

        passwordToggle.addEventListener('click', () => {
            this.togglePasswordVisibility(passwordInput, passwordToggle);
        });

        confirmPasswordToggle.addEventListener('click', () => {
            this.togglePasswordVisibility(confirmPasswordInput, confirmPasswordToggle);
        });
    }

    togglePasswordVisibility(input, button) {
        const icon = button.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    setupFormValidation() {
        const fullNameInput = document.getElementById('fullNameInput');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const confirmPasswordInput = document.getElementById('confirmPasswordInput');

        // Real-time validation
        fullNameInput.addEventListener('blur', () => this.validateFullName());
        emailInput.addEventListener('blur', () => this.validateEmail());
        passwordInput.addEventListener('input', () => this.validatePassword());
        confirmPasswordInput.addEventListener('blur', () => this.validateConfirmPassword());

        // Enter key handling
        [fullNameInput, emailInput, passwordInput, confirmPasswordInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.processRegistration();
                }
            });
        });
    }

    // ========================
    // VALIDATION METHODS
    // ========================

    validateFullName() {
        const input = document.getElementById('fullNameInput');
        const errorDiv = document.getElementById('fullNameError');
        const value = input.value.trim();

        if (!value) {
            this.showFieldError(errorDiv, 'El nombre completo es requerido');
            input.classList.add('error');
            return false;
        }

        if (value.length < 2) {
            this.showFieldError(errorDiv, 'El nombre debe tener al menos 2 caracteres');
            input.classList.add('error');
            return false;
        }

        if (value.length > 100) {
            this.showFieldError(errorDiv, 'El nombre es demasiado largo');
            input.classList.add('error');
            return false;
        }

        // Verificar que contenga al menos 2 palabras (nombre y apellido)
        const words = value.split(/\s+/).filter(word => word.length > 0);
        if (words.length < 2) {
            this.showFieldError(errorDiv, 'Ingresa tu nombre y apellido');
            input.classList.add('error');
            return false;
        }

        // Verificar que no contenga números
        if (/\d/.test(value)) {
            this.showFieldError(errorDiv, 'El nombre no debe contener números');
            input.classList.add('error');
            return false;
        }

        // Verificar que solo contenga letras, espacios, acentos y algunos caracteres especiales
        const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-'\.]+$/;
        if (!nameRegex.test(value)) {
            this.showFieldError(errorDiv, 'El nombre contiene caracteres no válidos');
            input.classList.add('error');
            return false;
        }

        // Verificar que cada palabra tenga al menos 2 caracteres
        const hasShortWords = words.some(word => word.length < 2);
        if (hasShortWords) {
            this.showFieldError(errorDiv, 'Cada nombre debe tener al menos 2 caracteres');
            input.classList.add('error');
            return false;
        }

        this.hideFieldError(errorDiv);
        input.classList.remove('error');
        input.classList.add('success');
        return true;
    }

    validateEmail() {
        const input = document.getElementById('emailInput');
        const errorDiv = document.getElementById('emailError');
        const value = input.value.trim();

        if (!value) {
            this.showFieldError(errorDiv, 'El email es requerido');
            input.classList.add('error');
            return false;
        }

        // Regex más estricto para emails
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!emailRegex.test(value)) {
            this.showFieldError(errorDiv, 'Formato de email inválido');
            input.classList.add('error');
            return false;
        }

        // Validaciones adicionales
        if (value.length > 254) {
            this.showFieldError(errorDiv, 'Email demasiado largo');
            input.classList.add('error');
            return false;
        }

        // Lista de dominios comúnmente mal escritos
        const commonTypos = {
            'gmai.com': 'gmail.com',
            'gmial.com': 'gmail.com',
            'gamil.com': 'gmail.com',
            'yahho.com': 'yahoo.com',
            'yaho.com': 'yahoo.com',
            'hotmial.com': 'hotmail.com',
            'hotmail.co': 'hotmail.com'
        };

        const domain = value.split('@')[1];
        if (commonTypos[domain]) {
            this.showFieldError(errorDiv, `¿Quisiste decir ${value.replace(domain, commonTypos[domain])}?`);
            input.classList.add('error');
            return false;
        }

        this.hideFieldError(errorDiv);
        input.classList.remove('error');
        input.classList.add('success');
        return true;
    }

    validatePassword() {
        const input = document.getElementById('passwordInput');
        const errorDiv = document.getElementById('passwordError');
        const strengthDiv = document.getElementById('passwordStrength');
        const value = input.value;

        if (!value) {
            this.showFieldError(errorDiv, 'La contraseña es requerida');
            input.classList.add('error');
            strengthDiv.innerHTML = '';
            return false;
        }

        // Verificaciones de seguridad
        const errors = [];

        if (value.length < 8) {
            errors.push('al menos 8 caracteres');
        }
        
        if (!/[a-z]/.test(value)) {
            errors.push('una letra minúscula');
        }
        
        if (!/[A-Z]/.test(value)) {
            errors.push('una letra mayúscula');
        }
        
        if (!/[0-9]/.test(value)) {
            errors.push('un número');
        }
        
        if (!/[^A-Za-z0-9]/.test(value)) {
            errors.push('un carácter especial (!@#$%^&*)');
        }

        // Verificar contraseñas comunes débiles
        const weakPasswords = [
            'password', 'password123', '12345678', 'qwerty123', 
            'abc123456', 'password1', '123456789', 'qwertyuiop'
        ];
        
        if (weakPasswords.includes(value.toLowerCase())) {
            errors.push('evitar contraseñas comunes');
        }

        // Si hay errores de seguridad mínima
        if (errors.length > 0) {
            this.showFieldError(errorDiv, `La contraseña debe tener: ${errors.join(', ')}`);
            input.classList.add('error');
            strengthDiv.innerHTML = '<div class="strength-weak">Muy débil - No válida</div>';
            return false;
        }

        // Password strength calculation
        let strength = 0;
        let strengthText = '';
        let strengthClass = '';
        
        // Basic requirements met
        strength += 2;
        
        // Length bonus
        if (value.length >= 12) strength += 2;
        else if (value.length >= 10) strength += 1;
        
        // Variety bonus
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) strength += 1;
        if (/[A-Z].*[A-Z]/.test(value)) strength += 1; // Multiple uppercase
        if (/[0-9].*[0-9]/.test(value)) strength += 1; // Multiple numbers
        
        // No repeated patterns
        if (!/(.)\1{2,}/.test(value)) strength += 1; // No 3+ repeated chars
        
        // Determine strength level
        if (strength <= 3) {
            strengthText = 'Débil';
            strengthClass = 'strength-weak';
        } else if (strength <= 5) {
            strengthText = 'Media';
            strengthClass = 'strength-medium';
        } else if (strength <= 7) {
            strengthText = 'Fuerte';
            strengthClass = 'strength-strong';
        } else {
            strengthText = 'Muy Fuerte';
            strengthClass = 'strength-very-strong';
        }

        this.hideFieldError(errorDiv);
        input.classList.remove('error');
        input.classList.add('success');
        
        strengthDiv.innerHTML = `<div class="${strengthClass}">${strengthText}</div>`;

        return true;
    }

    validateConfirmPassword() {
        const passwordInput = document.getElementById('passwordInput');
        const confirmInput = document.getElementById('confirmPasswordInput');
        const errorDiv = document.getElementById('confirmPasswordError');
        
        const password = passwordInput.value;
        const confirmPassword = confirmInput.value;

        if (!confirmPassword) {
            this.showFieldError(errorDiv, 'Confirma tu contraseña');
            confirmInput.classList.add('error');
            return false;
        }

        if (password !== confirmPassword) {
            this.showFieldError(errorDiv, 'Las contraseñas no coinciden');
            confirmInput.classList.add('error');
            return false;
        }

        // Verificar que la contraseña original sea válida primero
        if (!this.validatePassword()) {
            this.showFieldError(errorDiv, 'Primero debe ser válida la contraseña principal');
            confirmInput.classList.add('error');
            return false;
        }

        this.hideFieldError(errorDiv);
        confirmInput.classList.remove('error');
        confirmInput.classList.add('success');
        return true;
    }

    showFieldError(errorDiv, message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.color = '#ef4444';
        errorDiv.style.fontSize = '0.875rem';
        errorDiv.style.marginTop = '0.5rem';
    }

    hideFieldError(errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
    }

    // ========================
    // REGISTRATION PROCESS
    // ========================

    async processRegistration() {
        if (this.isProcessing) return;
        
        const registerButton = document.getElementById('registerButton');
        const acceptTerms = document.getElementById('acceptTerms');
        
        // Verificar términos y condiciones
        if (!acceptTerms.checked) {
            this.showValidationError('Debes aceptar los términos y condiciones');
            return;
        }

        // Validar todos los campos
        const isValidName = this.validateFullName();
        const isValidEmail = this.validateEmail();
        const isValidPassword = this.validatePassword();
        const isValidConfirmPassword = this.validateConfirmPassword();

        if (!isValidName || !isValidEmail || !isValidPassword || !isValidConfirmPassword) {
            this.showValidationError('Por favor corrige los errores en el formulario');
            return;
        }

        this.isProcessing = true;
        registerButton.classList.add('processing');
        
        try {
            // Recolectar datos del usuario
            const userData = this.collectRegistrationData();
            
            // Verificar si el usuario ya existe
            const userExists = await this.checkUserExists(userData.email);
            if (userExists) {
                throw new Error('Ya existe una cuenta con este email');
            }

            // Crear usuario en Supabase
            const newUser = await this.createUserInSupabase(userData);
            
            // Procesar pago con Wompi (preparado para futuro)
            await this.processWompiPayment(userData, newUser);
            
            // Redirigir a página de verificación de email
            this.redirectToVerification(userData.email);
            
        } catch (error) {
            console.error('❌ Error en registro:', error);
            this.showErrorMessage(error.message);
        } finally {
            this.isProcessing = false;
            registerButton.classList.remove('processing');
        }
    }

    collectRegistrationData() {
        const fullName = document.getElementById('fullNameInput').value.trim();
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        
        // Plan prices in COP - Current pricing strategy
        const planPrices = {
            'starter': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 49000,
                description: 'Plan Inicial - Ideal para empezar'
            },
            'pro': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 149000,
                description: 'Plan Profesional - Más popular'
            },
            'enterprise': { 
                amount: 0, 
                display: 'Gratis',
                originalPrice: 299000,
                description: 'Plan Empresarial - Máxima productividad'
            }
        };

        const selectedPlanData = planPrices[this.selectedPlan?.type] || planPrices['pro'];

        return {
            fullName,
            email,
            password,
            plan: this.selectedPlan?.type || 'pro',
            planName: this.selectedPlan?.name || 'Plan Pro',
            planPrice: selectedPlanData.amount,
            planDisplay: selectedPlanData.display,
            paymentMethod: 'wompi',
            timestamp: Date.now(),
            registrationSource: 'payment_modal'
        };
    }

    // ========================
    // SUPABASE INTEGRATION
    // ========================

    async checkUserExists(email) {
        try {
            console.log('🔍 Verificando si existe usuario con email:', email);
            
            if (!window.supabaseClient?.isReady()) {
                console.warn('Supabase no disponible para verificar usuario');
                return false;
            }

            // Método simple y directo: solo usar signUp y manejar el error
            // No intentamos verificar antes, dejamos que Supabase nos diga si existe
            console.log('✅ Asumiendo que usuario no existe, continuando con registro');
            return false;
            
        } catch (error) {
            console.warn('Error verificando usuario existente:', error);
            return false; // En caso de error, permite continuar
        }
    }

    validateUserData(userData) {
        const { email, name } = userData;
        
        // Validar email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            this.showValidationError('Por favor, ingresa un email válido');
            return false;
        }

        // Validar nombre
        if (!name || name.length < 2) {
            this.showValidationError('Por favor, ingresa tu nombre completo');
            return false;
        }

        // Validar método de pago (para stripe validar tarjeta)
        if (this.selectedMethod === 'stripe') {
            const cardNumber = document.getElementById('cardInput').value.replace(/\s/g, '');
            const expiry = document.getElementById('expiryInput').value;
            const cvv = document.getElementById('cvvInput').value;

            if (!cardNumber || cardNumber.length < 16) {
                this.showValidationError('Número de tarjeta inválido');
                return false;
            }

            if (!expiry || expiry.length < 5) {
                this.showValidationError('Fecha de vencimiento inválida');
                return false;
            }

            if (!cvv || cvv.length < 3) {
                this.showValidationError('CVV inválido');
                return false;
            }
        }

        return true;
    }

    async createUserInSupabase(userData) {
        // Esperar a que Supabase esté listo
        let attempts = 0;
        const maxAttempts = 30; // 3 segundos máximo
        
        while (attempts < maxAttempts) {
            if (window.supabaseClient?.isReady()) {
                break;
            }
            
            console.log(`⏳ Esperando Supabase... intento ${attempts + 1}/${maxAttempts}`);
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.supabaseClient?.isReady()) {
            console.error('❌ Diagnóstico de Supabase:');
            console.error('- window.supabaseClient exists:', !!window.supabaseClient);
            console.error('- isReady():', window.supabaseClient?.isReady?.());
            console.error('- supabase client:', window.supabaseClient?.supabase);
            throw new Error('Sistema de base de datos no disponible después de esperar');
        }

        try {
            console.log('🔄 Iniciando registro de usuario en Supabase...');
            
            // Limpiar sesiones corruptas antes de intentar registro
            try {
                const { data: session, error: sessionError } = await window.supabaseClient.supabase.auth.getSession();
                if (sessionError && sessionError.message.includes('Invalid Refresh Token')) {
                    console.log('🧹 Limpiando sesión corrupta antes del registro...');
                    await window.supabaseClient.cleanCorruptSessions();
                }
            } catch (cleanError) {
                console.log('⚠️ Error limpiando sesión (continuando):', cleanError.message);
            }
            
            // 1. Crear usuario con autenticación de Supabase
            const authResult = await window.supabaseClient.supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        full_name: userData.fullName,
                        plan_type: userData.plan,
                        registration_source: userData.registrationSource
                    }
                }
            });

            if (authResult.error) {
                console.error('❌ Error en autenticación Supabase:', authResult.error);
                
                // Si es error de refresh token, limpiar y reintentar
                if (authResult.error.message.includes('Invalid Refresh Token')) {
                    console.log('🔄 Detectado error de refresh token, limpiando y reintentando...');
                    await window.supabaseClient.cleanCorruptSessions();
                    throw new Error('Sesión expirada. Por favor, recarga la página e intenta de nuevo.');
                }
                
                throw new Error(authResult.error.message);
            }

            const user = authResult.data.user;
            console.log('✅ Usuario creado en auth.users:', user.id);
            
            // 2. Intentar crear perfil en user_profiles - manejo mejorado de RLS
            console.log('📤 Creando perfil de usuario...');
            
            // Wait for potential trigger execution
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if profile was created by trigger first
            let profileData = null;
            try {
                // Use admin client to check for existing profile
                const adminClient = window.supabaseClient.getAdminClient();
                const clientToUse = adminClient || window.supabaseClient.supabase;
                
                const { data: existingProfile, error: checkError } = await clientToUse
                    .from('user_profiles')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();
                
                if (existingProfile && !checkError) {
                    console.log('✅ Perfil ya existe (creado por trigger):', existingProfile);
                    profileData = existingProfile;
                } else if (checkError && checkError.code !== 'PGRST116') {
                    console.log('⚠️ Error verificando perfil existente:', checkError);
                }
            } catch (e) {
                console.log('🔍 Perfil no existe, intentando crear...');
            }
            
            // If no profile exists, try to create one
            if (!profileData) {
                const userProfileData = {
                    user_id: user.id,
                full_name: userData.fullName,
                    country: 'CO',
                    language: 'es', 
                    plan_type: userData.plan,
                    plan_status: 'pending_payment',
                created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                console.log('📋 Intentando insertar perfil con cliente normal...');

                // First try with normal client
                const { data: newProfile, error: profileError } = await window.supabaseClient.supabase
                    .from('user_profiles')
                    .insert([userProfileData])
                    .select()
                    .single();

            if (profileError) {
                    console.error('❌ Error creando perfil con cliente normal:', profileError);
                    console.error('📋 Código de error:', profileError.code);
                    console.error('📋 Mensaje:', profileError.message);
                    
                    // Handle duplicate key error (23505)
                    if (profileError.code === '23505' || profileError.message.includes('already exists')) {
                        console.log('⚠️ Perfil ya existe (duplicate key), intentando obtenerlo...');
                        try {
                            const { data: existingProfile } = await window.supabaseClient.supabase
                                .from('user_profiles')
                                .select('*')
                                .eq('user_id', user.id)
                                .single();
                            profileData = existingProfile;
                            console.log('✅ Perfil existente obtenido:', profileData);
                        } catch (getError) {
                            console.warn('⚠️ No se pudo obtener el perfil existente');
                        }
                    }
                    // If it's an RLS error, try with admin client
                    else if (profileError.code === '42501' || profileError.message.includes('row-level security')) {
                        console.log('🔄 Intentando con cliente administrativo...');
                        
                        const adminClient = window.supabaseClient.getAdminClient();
                        if (adminClient) {
                            const { data: adminProfile, error: adminError } = await adminClient
                                .from('user_profiles')
                                .insert([userProfileData])
                                .select()
                                .single();
                            
                            if (adminError) {
                                // Check if admin error is also duplicate key
                                if (adminError.code === '23505') {
                                    console.log('✅ Perfil ya existía, continuando...');
                                } else {
                                    console.error('❌ Error con cliente admin:', adminError);
                                    console.warn('⚠️ Error de RLS persistente - continuando sin perfil por ahora');
                                }
                            } else {
                                profileData = adminProfile;
                                console.log('✅ Perfil creado exitosamente con admin client:', profileData);
                            }
                        } else {
                            console.warn('⚠️ Cliente admin no disponible - continuando sin perfil');
                        }
                    } else {
                        // For other errors, continue without throwing
                        console.warn('⚠️ Error inesperado creando perfil, continuando sin perfil por ahora');
                    }
                } else {
                    profileData = newProfile;
                    console.log('✅ Perfil creado exitosamente:', profileData);
                }
            }

            // 3. Crear suscripción inicial en estado pendiente
            const now = new Date();
            const trialEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días de prueba
            
            const subscriptionData = {
                user_id: user.id,
                plan_type: userData.plan,
                status: 'pending_payment', // Estados: pending_payment, active, past_due, cancelled, expired
                current_period_start: now.toISOString(),
                current_period_end: trialEndDate.toISOString(),
                renewal_period: '1 month', // Período de renovación por defecto
                created_at: now.toISOString()
            };

            console.log('📋 Creando suscripción con datos:', subscriptionData);

            const { data: subscriptionResult, error: subscriptionError } = await window.supabaseClient.supabase
                .from('subscriptions')
                .insert([subscriptionData])
                .select()
                .single();

            if (subscriptionError) {
                console.error('❌ Error creando suscripción inicial:', subscriptionError);
                console.error('📋 Código de error:', subscriptionError.code);
                console.error('📋 Datos de suscripción enviados:', subscriptionData);
                
                // If it's an RLS error, continue without throwing
                if (subscriptionError.code === '42501' || subscriptionError.message.includes('row-level security')) {
                    console.warn('⚠️ Error de RLS en suscripción - continuando sin suscripción por ahora');
                    console.warn('⚠️ La suscripción se puede crear después del login exitoso');
                } else {
                    console.warn('⚠️ Error creando suscripción, se puede crear manualmente');
                }
            } else {
                console.log('✅ Suscripción inicial creada exitosamente:', subscriptionResult);
            }

            // 4. Guardar en estado local de la aplicación
            if (window.AppState) {
                window.AppState.setUser({
                    id: user.id,
                    email: userData.email,
                    name: userData.fullName,
                    plan: userData.plan,
                    created: userProfileData.created_at
                });
            }

            // 5. Guardar en sessionStorage para el onboarding
            sessionStorage.setItem('currentUser', JSON.stringify({
                id: user.id,
                email: userData.email,
                name: userData.fullName,
                plan: userData.plan,
                supabaseId: user.id,
                needsPayment: true,
                subscriptionId: subscriptionResult?.id || null
            }));

            // 6. Registrar evento analítico (si está disponible)
            try {
                if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                    window.analyticsEngine.track('user_registered', {
                        user_id: user.id,
                    plan: userData.plan,
                    method: userData.paymentMethod,
                    source: userData.registrationSource,
                    amount: userData.planPrice
                });
                } else {
                    console.log('📊 Analytics engine not available, skipping tracking');
                }
            } catch (analyticsError) {
                console.warn('⚠️ Error tracking analytics:', analyticsError.message);
            }

            console.log('✅ Usuario registrado completamente:', {
                user_id: user.id,
                email: userData.email,
                plan: userData.plan,
                profile_created: !!profileData,
                subscription_created: !!subscriptionResult
            });

            return {
                ...user,
                full_name: userData.fullName,
                plan: userData.plan,
                plan_price: userData.planPrice,
                subscription_id: subscriptionResult?.id
            };

        } catch (error) {
            console.error('❌ Error en createUserInSupabase:', error);
            console.error('📋 Error completo:', {
                message: error.message,
                code: error.code,
                status: error.status
            });
            
            // Manejo específico de errores de Supabase Auth
            if (error.message.includes('User already registered') || 
                error.message.includes('already') ||
                error.message.includes('user_already_exists') ||
                error.code === 'email_address_already_exists' ||
                error.code === 'user_already_exists') {
                throw new Error('Ya existe una cuenta con este email');
            }
            
            if (error.message.includes('weak_password') || 
                error.message.includes('Password should be at least 6 characters')) {
                throw new Error('La contraseña es muy débil. Debe tener al menos 8 caracteres con mayúsculas, minúsculas, números y símbolos');
            }
            
            if (error.message.includes('invalid_email') || 
                error.message.includes('Unable to validate email')) {
                throw new Error('El formato del email no es válido. Verifica que esté bien escrito');
            }
            
            if (error.message.includes('signup_disabled')) {
                throw new Error('El registro está temporalmente deshabilitado. Inténtalo más tarde');
            }
            
            if (error.message.includes('rate_limit') || error.message.includes('too_many_requests')) {
                throw new Error('Has realizado demasiados intentos. Espera unos minutos antes de intentar nuevamente');
            }
            
            // Errores de base de datos
            if (error.message.includes('foreign key') || error.message.includes('violates')) {
                throw new Error('Error de integridad de datos. Contacta con soporte técnico');
            }
            
            if (error.message.includes('permission') || error.message.includes('RLS')) {
                throw new Error('Error de permisos. Contacta con soporte técnico');
            }
            
            // Errores de conexión
            if (error.message.includes('network') || 
                error.message.includes('fetch') ||
                error.message.includes('timeout')) {
                throw new Error('Error de conexión. Verifica tu internet e inténtalo nuevamente');
            }
            
            // Error genérico con más información para debugging
            let userFriendlyMessage = 'Ocurrió un error durante el registro';
            
            // Si el error es corto, mostrarlo tal como está
            if (error.message && error.message.length < 100) {
                userFriendlyMessage = error.message;
            }
            
            throw new Error(userFriendlyMessage);
        }
    }

    // ========================
    // WOMPI PAYMENT INTEGRATION
    // ========================

    async processWompiPayment(userData, user) {
        try {
            console.log('💳 Iniciando proceso de pago con Wompi (Beta)...');
            
            // =========================================
            // SECCIÓN PREPARADA PARA INTEGRACIÓN REAL CON WOMPI
            // =========================================
            /* 
            // TODO: Implementar integración real con Wompi API
            // Documentación: https://docs.wompi.co/
            // 
            // PASOS PARA IMPLEMENTACIÓN FUTURA:
            // 
            // 1. Configurar credenciales de Wompi
            const wompiCredentials = {
                public_key: process.env.WOMPI_PUBLIC_KEY || 'pub_test_XXXXXXXXXX',
                private_key: process.env.WOMPI_PRIVATE_KEY || 'prv_test_XXXXXXXXXX',
                environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            };
            
            // 2. Crear transacción de pago
            const paymentData = {
                amount_in_cents: userData.planPrice * 100, // Convertir COP a centavos
                currency: 'COP',
                customer_email: userData.email,
                customer_data: {
                    full_name: userData.fullName,
                    phone_number: userData.phone || '', // Opcional
                    legal_id: userData.cedula || '', // Opcional para Colombia
                    legal_id_type: 'CC' // Tipo de documento
                },
                payment_method: {
                    type: 'CARD', // CARD, PSE, NEQUI, etc.
                    installments: 1 // Número de cuotas
                },
                reference: `ugc_subscription_${user.id}_${Date.now()}`,
                redirect_url: `${window.location.origin}/payment-callback`,
                // URL para webhooks de verificación
                confirmation_url: `${window.location.origin}/api/wompi/webhook`,
                // Metadatos adicionales
                metadata: {
                    user_id: user.id,
                    plan_type: userData.plan,
                    subscription_id: user.subscription_id || null,
                    registration_source: userData.registrationSource
                }
            };
            
            // 3. Crear transacción en Wompi
            const createTransactionResponse = await fetch('https://api.wompi.co/v1/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${wompiCredentials.public_key}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(paymentData)
            });
            
            const transactionResult = await createTransactionResponse.json();
            
            if (!createTransactionResponse.ok || transactionResult.error) {
                throw new Error(`Error Wompi: ${transactionResult.error?.type || 'Error desconocido'}`);
            }
            
            // 4. Guardar información de transacción para seguimiento
            const paymentRecord = {
                subscription_id: user.subscription_id,
                amount: userData.planPrice,
                currency: 'COP',
                status: 'pending',
                provider: 'wompi',
                provider_payment_id: transactionResult.data.id,
                period_start: new Date().toISOString(),
                period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
                created_at: new Date().toISOString()
            };
            
            // Guardar en tabla payments
            await window.supabaseClient.supabase
                .from('payments')
                .insert([paymentRecord]);
            
            // 5. Guardar ID de transacción para verificación posterior
            sessionStorage.setItem('wompi_transaction_id', transactionResult.data.id);
            sessionStorage.setItem('wompi_reference', paymentData.reference);
            
            // 6. Redirigir al checkout de Wompi
            console.log('🔄 Redirigiendo al checkout de Wompi...');
            window.location.href = transactionResult.data.payment_link_url;
            
            // No debería llegar aquí debido a la redirección
            return transactionResult.data;
            */
            
            // =========================================
            // REGISTRO GRATUITO DURANTE PERÍODO DE LANZAMIENTO
            // =========================================
            console.log('🎉 [BETA] Procesando registro gratuito durante período de lanzamiento...');
            console.log('📊 Datos del registro:', {
                user_id: user.id,
                email: userData.email,
                plan: userData.plan,
                status: 'free_trial',
                billing_start: 'TBD'
            });
            
            // Simular delay del procesamiento (como si fuera una llamada real a API)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Simular respuesta exitosa de Wompi
            const simulatedTransaction = {
                id: `wompi_sim_${Date.now()}`,
                status: 'APPROVED', // Estados: PENDING, APPROVED, DECLINED, ERROR
                reference: `ugc_subscription_${user.id}_${Date.now()}`,
                amount_in_cents: userData.planPrice * 100,
                amount: userData.planPrice,
                currency: 'COP',
                payment_method: {
                    type: 'CARD',
                    extra: {
                        brand: 'VISA',
                        last_four: '1234'
                    }
                },
                customer_email: userData.email,
                created_at: new Date().toISOString(),
                // Simular respuesta típica de Wompi
                payment_link_url: null, // Ya no necesario en simulación
                merchant: {
                    name: 'AI Smart Content',
                    legal_name: 'AI Smart Content SAS',
                    contact_name: 'AI Smart Content'
                }
            };
            
            // Crear registro de pago en la base de datos
            await this.createPaymentRecord(user.subscription_id, simulatedTransaction, userData);
            
            // Actualizar estado de suscripción a activa
            await this.updateSubscriptionStatus(user.id, 'active', simulatedTransaction.id);
            
            console.log('✅ [BETA] Pago simulado exitosamente:', {
                transaction_id: simulatedTransaction.id,
                amount: userData.planPrice,
                status: simulatedTransaction.status
            });
            
            return simulatedTransaction;
            
        } catch (error) {
            console.error('❌ Error procesando pago Wompi:', error);
            
            // Registrar el error en la base de datos para análisis
            await this.logPaymentError(user.id, error.message, userData);
            
            throw new Error(`Error en el procesamiento del pago: ${error.message}`);
        }
    }
    
    // ========================
    // MÉTODOS AUXILIARES PARA WOMPI
    // ========================
    
    async createPaymentRecord(subscriptionId, transactionData, userData) {
        try {
            if (!window.supabaseClient?.isReady() || !subscriptionId) return;
            
            const paymentRecord = {
                subscription_id: subscriptionId,
                amount: transactionData.amount,
                currency: transactionData.currency || 'COP',
                status: transactionData.status === 'APPROVED' ? 'paid' : 'pending',
                provider: 'wompi',
                provider_payment_id: transactionData.id,
                period_start: new Date().toISOString(),
                period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString()
            };
            
            const { error } = await window.supabaseClient.supabase
                .from('payments')
                .insert([paymentRecord]);
                
            if (error) {
                console.warn('⚠️ Error guardando registro de pago:', error);
            } else {
                console.log('✅ Registro de pago creado exitosamente');
            }
        } catch (error) {
            console.warn('Error en createPaymentRecord:', error);
        }
    }
    
    async logPaymentError(userId, errorMessage, userData) {
        try {
            if (!window.supabaseClient?.isReady()) return;
            
            // Log en tabla de eventos o crear tabla específica para errores
            console.log('📝 Registrando error de pago:', {
                user_id: userId,
                error: errorMessage,
                plan: userData.plan,
                amount: userData.planPrice
            });
            
            // TODO: Implementar tabla de logs de errores si es necesario
            
        } catch (error) {
            console.warn('Error registrando error de pago:', error);
        }
    }

    async updateSubscriptionStatus(userId, status, transactionId = null) {
        try {
            if (!window.supabaseClient?.isReady()) return;

            // Actualizar estado en user_profiles
            const profileUpdateData = {
                plan_status: status,
                updated_at: new Date().toISOString()
            };

            const { error: profileError } = await window.supabaseClient.supabase
                .from('user_profiles')
                .update(profileUpdateData)
                .eq('user_id', userId);

            if (profileError) {
                console.warn('⚠️ Error actualizando perfil de usuario:', profileError);
            }

            // Actualizar estado en subscriptions
            const subscriptionUpdateData = {
                status: status,
                updated_at: new Date().toISOString()
            };

            if (transactionId) {
                subscriptionUpdateData.current_period_start = new Date().toISOString();
                subscriptionUpdateData.current_period_end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            }

            const { error: subscriptionError } = await window.supabaseClient.supabase
                .from('subscriptions')
                .update(subscriptionUpdateData)
                .eq('user_id', userId);

            if (subscriptionError) {
                console.warn('⚠️ Error actualizando suscripción:', subscriptionError);
            } else {
                console.log('✅ Estado de suscripción actualizado:', status);
            }

        } catch (error) {
            console.warn('Error en updateSubscriptionStatus:', error);
        }
    }

    showValidationError(message) {
        // Crear y mostrar mensaje de error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'validation-error';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10002;
            animation: slideInRight 0.3s ease;
        `;
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        // Auto remover después de 4 segundos
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 4000);

        // Agregar estilo de animación si no existe
        if (!document.getElementById('validation-error-styles')) {
            const style = document.createElement('style');
            style.id = 'validation-error-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showErrorMessage(message) {
        console.log('🚨 Mostrando error:', message);
        
        // Determine if it's a duplicate user error
        const isDuplicateUser = message.includes('Ya existe una cuenta');
        
        const errorHTML = `
            <div class="payment-overlay active" id="errorOverlay" style="z-index: 10001;">
                <div class="payment-modal" style="transform: scale(1); max-width: 450px;">
                    <div class="payment-header" style="text-align: center; border-bottom: none;">
                        <div style="
                            width: 80px;
                            height: 80px;
                            background: linear-gradient(135deg, #ef4444, #dc2626);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 1.5rem;
                            font-size: 2rem;
                            color: white;
                            box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
                        ">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h2 class="payment-title">Error en el Proceso</h2>
                        <p class="payment-subtitle" style="margin-bottom: 0.5rem;">${message}</p>
                        ${isDuplicateUser ? '<p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0;">¿Ya tienes una cuenta? Puedes iniciar sesión en su lugar.</p>' : ''}
                    </div>
                    <div class="payment-body" style="text-align: center; padding: 1rem 2rem 2rem 2rem;">
                        ${isDuplicateUser ? `
                            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                                <button onclick="this.handleRetryWithNewEmail()" 
                                        class="btn-primary" style="flex: 1; min-width: 140px;">
                                    Intentar Otro Email
                                </button>
                                <button onclick="this.handleLoginRedirect()" 
                                        class="btn-outline" style="flex: 1; min-width: 140px;">
                                    Iniciar Sesión
                                </button>
                            </div>
                        ` : `
                        <button onclick="document.getElementById('errorOverlay').remove()" 
                                class="btn-primary" style="width: 100%;">
                            Intentar de Nuevo
                        </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        // Remove any existing error overlay first
        const existingError = document.getElementById('errorOverlay');
        if (existingError) {
            existingError.remove();
        }

        document.body.insertAdjacentHTML('beforeend', errorHTML);

        // Add event handlers for duplicate user actions
        if (isDuplicateUser) {
            window.handleRetryWithNewEmail = () => {
                document.getElementById('errorOverlay').remove();
                const emailInput = document.getElementById('emailInput');
                if (emailInput) {
                    emailInput.value = '';
                    emailInput.focus();
                    // Clear any existing error states
                    emailInput.classList.remove('error');
                    const errorDiv = document.getElementById('emailError');
                    if (errorDiv) {
                        errorDiv.style.display = 'none';
                    }
                }
            };
            
            window.handleLoginRedirect = () => {
                document.getElementById('errorOverlay').remove();
                console.log('🔄 Redirigiendo a página de login...');
                // Here you could redirect to login page
                // window.location.href = '/login.html';
                alert('Funcionalidad de login aún no implementada. Por favor usa otro email.');
            };
        }

        // Auto remover después de 10 segundos para errores de duplicado, 5 para otros
        const autoRemoveTime = isDuplicateUser ? 10000 : 5000;
        setTimeout(() => {
            const errorOverlay = document.getElementById('errorOverlay');
            if (errorOverlay) {
                errorOverlay.remove();
            }
        }, autoRemoveTime);
    }

    redirectToVerification(email) {
        console.log('🔄 Redirigiendo a página de verificación de email...');
        console.log('📧 Email para verificación:', email);
        
        // Store email for verification page
        localStorage.setItem('verificationEmail', email);
        console.log('💾 Email guardado en localStorage:', localStorage.getItem('verificationEmail'));
        
        // Force close ALL modals and overlays immediately
        this.forceCloseAllModals();
        
        // Use replace instead of href to avoid history issues
        console.log('🔗 Redirigiendo a página completa:', `verify-email.html?email=${encodeURIComponent(email)}`);
        
        // Force a clean page load with timeout to ensure modal cleanup
        setTimeout(() => {
            window.location.replace(`verify-email.html?email=${encodeURIComponent(email)}`);
        }, 100);
    }

    forceCloseAllModals() {
        console.log('🗑️ Cerrando todos los modales...');
        
        // Remove all modal-related elements
        const selectors = [
            '.payment-overlay',
            '.modal-overlay', 
            '#paymentOverlay',
            '#successOverlay',
            '#errorOverlay',
            '.error-modal',
            '[id*="modal"]',
            '[class*="modal"]',
            '[class*="overlay"]'
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element && element.parentNode) {
                    element.remove();
                    console.log('🗑️ Removido:', selector);
                }
            });
        });
        
        // Reset body styles that might interfere
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.height = '';
        
        // Remove any backdrop blur effects
        document.body.style.filter = '';
        document.body.style.backdropFilter = '';
        
        console.log('✅ Todos los modales cerrados');
    }

    showSuccessMessage() {
        const successHTML = `
            <div class="payment-overlay active" id="successOverlay" style="z-index: 10001;">
                <div class="payment-modal" style="transform: scale(1); max-width: 450px;">
                    <div class="payment-header" style="text-align: center; border-bottom: none;">
                        <div style="
                            width: 80px;
                            height: 80px;
                            background: linear-gradient(135deg, #34d399, #10b981);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 1.5rem;
                            font-size: 2rem;
                            color: white;
                            animation: checkAnimation 0.8s ease-in-out;
                        ">
                            <i class="fas fa-check"></i>
                        </div>
                        <h2 class="payment-title">¡Cuenta Creada Exitosamente!</h2>
                        <p class="payment-subtitle">Registro y pago procesados correctamente</p>
                    </div>
                    <div class="payment-body" style="text-align: center; padding: 1rem 2rem 2rem 2rem;">
                        <div style="
                            background: rgba(52, 211, 153, 0.1);
                            border: 1px solid rgba(52, 211, 153, 0.3);
                            border-radius: 12px;
                            padding: 1.25rem;
                            margin-bottom: 1.5rem;
                        ">
                            <div style="margin-bottom: 1rem;">
                                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                    <i class="fas fa-crown" style="color: #f59e0b;"></i>
                                    <strong style="color: #34d399;">${this.selectedPlan?.name || 'Plan Pro'}</strong>
                                </div>
                                <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                    Suscripción activada • Wompi
                                </div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                <div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Email registrado</div>
                                    <div style="font-size: 0.9rem; color: #34d399; font-weight: 500;">✓ Confirmado</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Estado del pago</div>
                                    <div style="font-size: 0.9rem; color: #34d399; font-weight: 500;">✓ Procesado</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 0.75rem;
                            color: var(--text-secondary);
                            font-size: 0.9rem;
                            margin-bottom: 1rem;
                        ">
                            <div style="
                                width: 20px;
                                height: 20px;
                                border: 2px solid var(--primary-color);
                                border-radius: 50%;
                                border-top: 2px solid transparent;
                                animation: spin 1s linear infinite;
                            "></div>
                            <span>Preparando tu experiencia personalizada...</span>
                        </div>
                        
                        <div style="
                            background: rgba(210, 254, 63, 0.1);
                            border: 1px solid rgba(210, 254, 63, 0.3);
                            border-radius: 8px;
                            padding: 0.75rem;
                            font-size: 0.85rem;
                            color: var(--text-secondary);
                        ">
                            <i class="fas fa-info-circle" style="color: var(--primary-color); margin-right: 0.5rem;"></i>
                            A continuación configuraremos tu marca, productos y avatar para generar contenido UGC personalizado
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', successHTML);
        
        // Add animation styles
        if (!document.getElementById('success-animation-styles')) {
            const style = document.createElement('style');
            style.id = 'success-animation-styles';
            style.textContent = `
                @keyframes checkAnimation {
                    0% { transform: scale(0) rotate(0deg); }
                    50% { transform: scale(1.2) rotate(180deg); }
                    100% { transform: scale(1) rotate(360deg); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        this.close(); // Cerrar modal de registro
        
        // Auto remove success overlay and redirect to onboarding
        setTimeout(() => {
            const successOverlay = document.getElementById('successOverlay');
            if (successOverlay) {
                successOverlay.remove();
            }
            
            // Store plan data and redirect to onboarding
            if (this.selectedPlan) {
                sessionStorage.setItem('selectedPlan', JSON.stringify(this.selectedPlan));
            }
            
            // Redirect to onboarding page
            window.location.href = 'onboarding-new.html';
        }, 3500);
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
            background: rgba(210, 254, 63, 0.3);
            border-radius: 50%;
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
            z-index: 1;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
}

// Initialize payment modal
let paymentModal;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 Inicializando PaymentModal...');
    
    // Esperar a que Supabase esté listo antes de inicializar PaymentModal
    let attempts = 0;
    const maxAttempts = 50; // 5 segundos máximo
    
    while (attempts < maxAttempts) {
        if (window.supabaseClient?.isReady()) {
            console.log('✅ Supabase listo, inicializando PaymentModal...');
            break;
        }
        
        console.log(`⏳ Esperando Supabase antes de inicializar PaymentModal... ${attempts + 1}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.supabaseClient?.isReady()) {
        console.warn('⚠️ PaymentModal inicializado sin Supabase (puede causar errores en registro)');
    }
    
    paymentModal = new PaymentModal();
    console.log('✅ PaymentModal inicializado correctamente');
});

// Function to open payment modal (called from planes.js)
function openPaymentModal(planData) {
    console.log('💳 Abriendo PaymentModal con datos:', planData);
    
    // Force recreate modal to ensure latest version
    if (paymentModal) {
        console.log('🔄 Forzando recreación del modal...');
        paymentModal.createModal(); // Recreate to ensure no cache issues
        paymentModal.bindEvents(); // Rebind events
        paymentModal.open(planData);
    } else {
        console.error('❌ PaymentModal no está disponible');
        console.log('🔄 Intentando crear PaymentModal nuevo...');
        paymentModal = new PaymentModal();
        setTimeout(() => openPaymentModal(planData), 100);
    }
}

// Make sure the function is globally available
window.openPaymentModal = openPaymentModal;

// Force clear any cached content on page load
document.addEventListener('DOMContentLoaded', function() {
    // Remove any old payment modals
    const oldModals = document.querySelectorAll('[class*="modal"], [id*="modal"]');
    oldModals.forEach(modal => {
        if (modal.innerHTML && (modal.innerHTML.includes('PayPal') || modal.innerHTML.includes('Stripe'))) {
            console.log('🧹 Removiendo modal de cache al cargar página');
            modal.remove();
        }
    });
});

// Add ripple animation CSS if not already added
if (!document.getElementById('ripple-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'ripple-animation-styles';
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

// Debug: Log all modals in page for troubleshooting
window.debugModals = function() {
    const allModals = document.querySelectorAll('[class*="modal"], [id*="modal"], [class*="overlay"]');
    console.log('🔍 Modales encontrados en la página:', allModals);
    allModals.forEach((modal, index) => {
        console.log(`Modal ${index}:`, {
            id: modal.id,
            classes: modal.className,
            hasPayPal: modal.innerHTML?.includes('PayPal'),
            hasWompi: modal.innerHTML?.includes('Wompi'),
            visible: getComputedStyle(modal).visibility,
            display: getComputedStyle(modal).display
        });
    });
};

// Test Supabase connection and user creation
window.testSupabaseConnection = async function() {
    console.log('🧪 Iniciando test de conexión Supabase...');
    
    try {
        // 1. Verificar que el cliente esté disponible
        if (!window.supabaseClient) {
            console.error('❌ supabaseClient no está disponible');
            return false;
        }
        
        if (!window.supabaseClient.isReady()) {
            console.error('❌ supabaseClient no está inicializado');
            return false;
        }
        
        console.log('✅ Cliente Supabase disponible');
        
        // 2. Test de conexión básica
        const { data: session, error: sessionError } = await window.supabaseClient.supabase.auth.getSession();
        if (sessionError) {
            console.error('❌ Error obteniendo sesión:', sessionError);
            return false;
        }
        
        console.log('✅ Conexión básica funcionando');
        
        // 3. Test de lectura de tabla (user_profiles)
        try {
            const { data: profiles, error: profilesError } = await window.supabaseClient.supabase
                .from('user_profiles')
                .select('user_id')
                .limit(1);
                
            if (profilesError) {
                console.warn('⚠️ Error accediendo a user_profiles:', profilesError);
            } else {
                console.log('✅ Acceso a user_profiles funciona');
            }
        } catch (e) {
            console.warn('⚠️ Tabla user_profiles puede no existir:', e.message);
        }
        
        // 4. Test de lectura de tabla (subscriptions)
        try {
            const { data: subs, error: subsError } = await window.supabaseClient.supabase
                .from('subscriptions')
                .select('id')
                .limit(1);
                
            if (subsError) {
                console.warn('⚠️ Error accediendo a subscriptions:', subsError);
            } else {
                console.log('✅ Acceso a subscriptions funciona');
            }
        } catch (e) {
            console.warn('⚠️ Tabla subscriptions puede no existir:', e.message);
        }
        
        console.log('✅ Test de conexión Supabase completado');
        return true;
        
    } catch (error) {
        console.error('❌ Error en test de Supabase:', error);
        return false;
    }
};

// Test user creation flow
window.testUserCreation = async function(testEmail = 'test@ugcstudio.com') {
    console.log('🧪 Iniciando test de creación de usuario...');
    console.log('📧 Email de prueba:', testEmail);
    
    try {
        const testUserData = {
            fullName: 'Usuario de Prueba',
            email: testEmail,
            password: 'TestPassword123!',
            plan: 'pro',
            planName: 'Plan Pro',
            planPrice: 79000,
            paymentMethod: 'wompi',
            registrationSource: 'test'
        };
        
        console.log('📋 Datos de prueba:', testUserData);
        
        // Verificar si el usuario ya existe
        console.log('🔍 Verificando si el usuario existe...');
        if (paymentModal) {
            const exists = await paymentModal.checkUserExists(testEmail);
            console.log('🔍 ¿Usuario existe?:', exists);
            
            if (exists) {
                console.log('⚠️ Usuario ya existe, no se puede probar creación');
                return false;
            }
        }
        
        // Intentar crear el usuario
        console.log('👤 Intentando crear usuario...');
        if (paymentModal) {
            const newUser = await paymentModal.createUserInSupabase(testUserData);
            console.log('✅ Usuario creado exitosamente:', newUser);
            
            return true;
        } else {
            console.error('❌ paymentModal no está disponible');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error en test de creación de usuario:', error);
        return false;
    }
};

// Test error handling scenarios
window.testErrorHandling = async function() {
    console.log('🧪 Iniciando test de manejo de errores...');
    
    const scenarios = [
        {
            name: 'Email duplicado',
            data: {
                fullName: 'Usuario Duplicado',
                email: 'test@ugcstudio.com', // Email que ya existe
                password: 'TestPassword123!',
                plan: 'pro'
            }
        },
        {
            name: 'Contraseña débil',
            data: {
                fullName: 'Usuario Débil',
                email: 'debil@ugcstudio.com',
                password: '123', // Contraseña muy débil
                plan: 'pro'
            }
        },
        {
            name: 'Email inválido',
            data: {
                fullName: 'Usuario Email Malo',
                email: 'email-mal-formateado', // Email sin formato válido
                password: 'TestPassword123!',
                plan: 'pro'
            }
        },
        {
            name: 'Nombre vacío',
            data: {
                fullName: '', // Nombre vacío
                email: 'sin-nombre@ugcstudio.com',
                password: 'TestPassword123!',
                plan: 'pro'
            }
        }
    ];
    
    for (const scenario of scenarios) {
        console.log(`\n🎯 Probando escenario: ${scenario.name}`);
        try {
            // Simular validación de formulario
            const mockForm = {
                validateFullName: () => scenario.data.fullName.length > 0,
                validateEmail: () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(scenario.data.email),
                validatePassword: () => scenario.data.password.length >= 8
            };
            
            const isValid = mockForm.validateFullName() && 
                           mockForm.validateEmail() && 
                           mockForm.validatePassword();
            
            if (!isValid) {
                console.log(`❌ Validación de formulario falló (esperado para "${scenario.name}")`);
                continue;
            }
            
            // Intentar crear usuario si pasa validación
            if (paymentModal) {
                await paymentModal.createUserInSupabase({
                    ...scenario.data,
                    planName: 'Plan Pro',
                    planPrice: 79000,
                    paymentMethod: 'wompi',
                    registrationSource: 'error_test'
                });
                console.log(`✅ Usuario creado exitosamente para "${scenario.name}"`);
            }
        } catch (error) {
            console.log(`❌ Error capturado para "${scenario.name}":`, error.message);
        }
    }
    
    console.log('\n✅ Test de manejo de errores completado');
};

// Test plan selection and modal adaptation
window.testPlanSelection = function() {
    console.log('🧪 Iniciando test de selección de planes...');
    
    const testPlans = [
        {
            name: 'Plan Inicial',
            type: 'starter',
            price: 'Gratis',
            originalPrice: 49000,
            features: ['1 UGC por ejecución', '1 Video HD', '1 Imagen optimizada'],
            ugcCount: 1,
            savings: '100%',
            popular: false
        },
        {
            name: 'Plan Profesional',
            type: 'pro',
            price: 'Gratis',
            originalPrice: 149000,
            features: ['3 UGC por ejecución', '3 Videos HD', '3 Imágenes optimizadas', 'A/B Testing'],
            ugcCount: 3,
            savings: '100%',
            popular: true
        },
        {
            name: 'Plan Empresarial',
            type: 'enterprise',
            price: 'Gratis',
            originalPrice: 299000,
            features: ['6 UGC por ejecución', '6 Videos HD', '6 Imágenes optimizadas', 'Análisis avanzado'],
            ugcCount: 6,
            savings: '100%',
            popular: false
        }
    ];
    
    console.log('📋 Planes a probar:', testPlans);
    
    testPlans.forEach((plan, index) => {
        setTimeout(() => {
            console.log(`\n🎯 Probando ${plan.name} (${plan.type})`);
            
            // Abrir modal con datos del plan
            if (typeof openPaymentModal === 'function') {
                openPaymentModal(plan);
                
                // Verificar después de 1 segundo
                setTimeout(() => {
                    const modal = document.getElementById('paymentOverlay');
                    if (modal && modal.classList.contains('active')) {
                        console.log(`✅ Modal abierto para ${plan.type}`);
                        
                        // Verificar elementos específicos
                        const planNameEl = document.getElementById('planName');
                        const planSelectedEl = document.getElementById('planSelected');
                        const featuresList = document.getElementById('featuresList');
                        
                        console.log('📋 Verificando contenido:', {
                            planName: planNameEl?.textContent,
                            planClass: planSelectedEl?.className,
                            featuresCount: featuresList?.children.length,
                            isPopular: plan.popular && planSelectedEl?.querySelector('.popular-indicator') !== null
                        });
                        
                        // Cerrar modal para siguiente test
                        if (index < testPlans.length - 1) {
                            setTimeout(() => {
                                const closeBtn = modal.querySelector('.close-btn');
                                if (closeBtn) closeBtn.click();
                            }, 1000);
                        }
                    } else {
                        console.log(`❌ Modal no se abrió para ${plan.type}`);
                    }
                }, 1000);
                
            } else {
                console.log('❌ openPaymentModal no está disponible');
            }
        }, index * 3000); // 3 segundos entre cada test
    });
    
    console.log('⏱️ Test iniciado. Cada plan se probará con 3 segundos de intervalo');
    console.log('🔍 Observa los logs y la interfaz para verificar el funcionamiento');
};

// Test with unique email to avoid duplicates
window.testWithUniqueEmail = function() {
    console.log('🧪 Probando registro con email único...');
    
    // Generate unique email based on timestamp
    const timestamp = Date.now();
    const uniqueEmail = `test-${timestamp}@ugcstudio.com`;
    
    console.log('📧 Email único generado:', uniqueEmail);
    
    // Fill out the form
    const fullNameInput = document.getElementById('fullNameInput');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    
    if (fullNameInput) fullNameInput.value = 'Usuario de Prueba';
    if (emailInput) emailInput.value = uniqueEmail;
    if (passwordInput) passwordInput.value = 'TestPassword123!';
    if (confirmPasswordInput) confirmPasswordInput.value = 'TestPassword123!';
    
    console.log('✅ Formulario completado con datos únicos');
    console.log('💡 Ahora puedes hacer clic en "Crear Cuenta y Pagar" para probar');
};

// Clear form for fresh start
window.clearTestForm = function() {
    console.log('🧹 Limpiando formulario...');
    
    const inputs = ['fullNameInput', 'emailInput', 'passwordInput', 'confirmPasswordInput'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            input.classList.remove('error', 'success');
        }
    });
    
    // Clear error messages
    const errorDivs = document.querySelectorAll('[id$="Error"]');
    errorDivs.forEach(div => {
        div.style.display = 'none';
    });
    
    // Clear terms checkbox
    const acceptTerms = document.getElementById('acceptTerms');
    if (acceptTerms) acceptTerms.checked = false;
    
    console.log('✅ Formulario limpiado');
};

// Advanced test function that handles all edge cases
window.testRegistrationFlow = async function(testEmail = null) {
    console.log('🧪 Iniciando test completo de registro...');
    
    try {
        // Generate unique email if not provided
        const timestamp = Date.now();
        const email = testEmail || `test-${timestamp}@ugcstudio.com`;
        
        console.log('📧 Email de prueba:', email);
        
        // Clear form and fill with test data
        clearTestForm();
        
        const fullNameInput = document.getElementById('fullNameInput');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const confirmPasswordInput = document.getElementById('confirmPasswordInput');
        const acceptTerms = document.getElementById('acceptTerms');
        
        if (fullNameInput) fullNameInput.value = 'Usuario de Prueba';
        if (emailInput) emailInput.value = email;
        if (passwordInput) passwordInput.value = 'TestPassword123!';
        if (confirmPasswordInput) confirmPasswordInput.value = 'TestPassword123!';
        if (acceptTerms) acceptTerms.checked = true;
        
        console.log('✅ Formulario completado');
        
        // Wait for user to click the button or simulate it
        console.log('🎯 Haz clic en "Crear Cuenta y Pagar" o ejecuta automáticamente...');
        
        // Auto-trigger registration after 3 seconds
        setTimeout(async () => {
            const registerButton = document.getElementById('registerButton');
            if (registerButton && !registerButton.disabled) {
                console.log('🤖 Ejecutando registro automáticamente...');
                registerButton.click();
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Error en test de registro:', error);
    }
};

// Test with known duplicate to test duplicate handling
// Quick diagnostic function
window.quickDiagnostic = function() {
    console.log('🔍 DIAGNÓSTICO RÁPIDO:');
    console.log('1. window.supabaseClient exists:', !!window.supabaseClient);
    console.log('2. supabaseClient.isReady():', window.supabaseClient?.isReady?.());
    console.log('3. paymentModal exists:', !!window.paymentModal);
    console.log('4. window.supabase library:', !!window.supabase);
    
    if (window.supabaseClient?.isReady()) {
        console.log('✅ Todo está listo para usar');
        
        // Test básico
        window.supabaseClient.supabase.auth.getSession()
            .then(({ data, error }) => {
                if (error) {
                    console.log('⚠️ Error en auth test:', error.message);
                } else {
                    console.log('✅ Auth test exitoso');
                }
            });
    } else {
        console.log('❌ Supabase no está listo');
        console.log('💡 Ejecuta debugSupabase() para más detalles');
    }
};

window.testDuplicateHandling = function() {
    console.log('🧪 Probando manejo de usuarios duplicados...');
    testRegistrationFlow('duplicate-test@ugcstudio.com');
};

// Test verification redirect directly
window.testVerificationRedirect = function(testEmail = 'test-redirect@ugcstudio.com') {
    console.log('🧪 Probando redirección a verificación...');
    console.log('📧 Email de prueba:', testEmail);
    console.log('🔍 Modal actual disponible:', !!paymentModal);
    
    if (paymentModal) {
        console.log('🚀 Iniciando redirección...');
        paymentModal.redirectToVerification(testEmail);
    } else {
        console.error('❌ PaymentModal no disponible');
        // Try direct redirect anyway
        console.log('⚡ Intentando redirección directa...');
        localStorage.setItem('verificationEmail', testEmail);
        window.location.replace(`verify-email.html?email=${encodeURIComponent(testEmail)}`);
    }
};

// Check current verification email
window.checkVerificationEmail = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const emailFromUrl = urlParams.get('email');
    const emailFromStorage = localStorage.getItem('verificationEmail');
    
    console.log('🔍 Estado actual de emails:');
    console.log('📧 Email desde URL:', emailFromUrl);
    console.log('📧 Email desde localStorage:', emailFromStorage);
    console.log('🌐 URL actual:', window.location.href);
    
    return {
        urlEmail: emailFromUrl,
        storageEmail: emailFromStorage,
        currentUrl: window.location.href
    };
};

// Debug RLS issues
window.debugRLSIssues = async function() {
    console.log('🔍 Diagnosticando problemas de RLS...');
    
    try {
        // Test basic connection
        if (!window.supabaseClient?.isReady()) {
            console.error('❌ Supabase client no está listo');
            return;
        }
        
        console.log('✅ Cliente Supabase disponible');
        
        // Test auth status
        const { data: session } = await window.supabaseClient.supabase.auth.getSession();
        console.log('🔐 Estado de autenticación:', {
            isLoggedIn: !!session?.session,
            user: session?.session?.user?.email || 'No autenticado'
        });
        
        // Test table access
        console.log('🧪 Probando acceso a tablas...');
        
        // Test user_profiles read
        try {
            const { data, error } = await window.supabaseClient.supabase
                .from('user_profiles')
                .select('count(*)')
                .limit(1);
            
            if (error) {
                console.error('❌ Error accediendo user_profiles:', error);
            } else {
                console.log('✅ Acceso a user_profiles funciona');
            }
        } catch (e) {
            console.error('❌ Excepción en user_profiles:', e.message);
        }
        
        // Test admin client
        console.log('🔧 Probando cliente administrativo...');
        const adminClient = window.supabaseClient.getAdminClient();
        if (adminClient) {
            try {
                const { data, error } = await adminClient
                    .from('user_profiles')
                    .select('count(*)')
                    .limit(1);
                
                if (error) {
                    console.error('❌ Error con cliente admin:', error);
                } else {
                    console.log('✅ Cliente administrativo funciona');
                }
            } catch (e) {
                console.error('❌ Excepción con cliente admin:', e.message);
            }
        } else {
            console.error('❌ Cliente administrativo no disponible');
        }
        
        console.log('🏁 Diagnóstico completado');
        
    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
    }
};
