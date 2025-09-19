// Payment Modal JavaScript

class PaymentModal {
    constructor() {
        this.isOpen = false;
        this.selectedMethod = 'stripe';
        this.selectedPlan = null;
        this.init();
    }

    init() {
        this.createModal();
        this.bindEvents();
    }

    createModal() {
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
                        <h2 class="payment-title">Completar Registro</h2>
                        <p class="payment-subtitle">Únete a UGC Studio y comienza a crear contenido profesional</p>
                        <div class="price-display">
                            <div class="price-amount" id="priceAmount">$0</div>
                            <div class="price-period">por mes • Prueba gratuita</div>
                        </div>
                    </div>

                    <div class="payment-body">
                        <!-- Trial Notice -->
                        <div class="trial-notice">
                            <div class="trial-icon">
                                <i class="fas fa-gift"></i>
                            </div>
                            <div class="trial-title">¡Prueba Gratuita Activada!</div>
                            <div class="trial-description">
                                Disfruta de 30 días completamente gratis. No se realizará ningún cargo hasta que termine tu período de prueba.
                            </div>
                        </div>

                        <!-- Payment Methods -->
                        <div class="payment-methods">
                            <h3 class="methods-title">
                                <i class="fas fa-credit-card"></i>
                                Método de Pago
                            </h3>
                            <div class="method-options">
                                <div class="method-option selected" data-method="stripe">
                                    <div class="method-radio"></div>
                                    <div class="method-icon stripe">
                                        <i class="fab fa-stripe-s"></i>
                                    </div>
                                    <div class="method-info">
                                        <div class="method-name">Tarjeta de Crédito/Débito</div>
                                        <div class="method-description">Visa, Mastercard, American Express</div>
                                    </div>
                                </div>
                                
                                <div class="method-option" data-method="paypal">
                                    <div class="method-radio"></div>
                                    <div class="method-icon paypal">
                                        <i class="fab fa-paypal"></i>
                                    </div>
                                    <div class="method-info">
                                        <div class="method-name">PayPal</div>
                                        <div class="method-description">Paga con tu cuenta de PayPal</div>
                                    </div>
                                </div>
                                
                                <div class="method-option" data-method="apple">
                                    <div class="method-radio"></div>
                                    <div class="method-icon apple">
                                        <i class="fab fa-apple"></i>
                                    </div>
                                    <div class="method-info">
                                        <div class="method-name">Apple Pay</div>
                                        <div class="method-description">Pago rápido y seguro con Touch ID</div>
                                    </div>
                                </div>
                                
                                <div class="method-option" data-method="google">
                                    <div class="method-radio"></div>
                                    <div class="method-icon google">
                                        <i class="fab fa-google"></i>
                                    </div>
                                    <div class="method-info">
                                        <div class="method-name">Google Pay</div>
                                        <div class="method-description">Pago instantáneo con Google</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Payment Form (only shown for stripe) -->
                        <div class="payment-form" id="paymentForm">
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" class="form-input" placeholder="tu@email.com" id="emailInput">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Nombre Completo</label>
                                <input type="text" class="form-input" placeholder="Juan Pérez" id="nameInput">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Número de Tarjeta</label>
                                <input type="text" class="form-input" placeholder="1234 5678 9012 3456" id="cardInput" maxlength="19">
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Fecha de Vencimiento</label>
                                    <input type="text" class="form-input" placeholder="MM/AA" id="expiryInput" maxlength="5">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">CVV</label>
                                    <input type="text" class="form-input" placeholder="123" id="cvvInput" maxlength="4">
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
                                <i class="fas fa-credit-card"></i>
                                <span>PCI Compliant</span>
                            </div>
                        </div>

                        <!-- Payment Summary -->
                        <div class="payment-total">
                            <div class="total-row">
                                <span class="total-label">Plan Mensual</span>
                                <span class="total-amount" id="monthlyPrice">$0.00</span>
                            </div>
                            <div class="total-row">
                                <span class="total-label">Descuento Prueba</span>
                                <span class="total-amount" style="color: #34d399;">-$0.00</span>
                            </div>
                            <div class="total-row">
                                <span class="total-label">Total Hoy</span>
                                <span class="total-amount">$0.00</span>
                            </div>
                        </div>

                        <!-- Payment Actions -->
                        <div class="payment-actions">
                            <button class="pay-button" id="payButton">
                                <div class="spinner"></div>
                                <span class="pay-text">
                                    <i class="fas fa-rocket"></i>
                                    Comenzar Prueba Gratuita
                                </span>
                            </button>
                            <button class="cancel-button" id="cancelPayment">Cancelar</button>
                        </div>

                        <!-- Disclaimer -->
                        <div class="payment-disclaimer">
                            Tu prueba gratuita comienza hoy. Después de 30 días, se cobrará automáticamente tu plan seleccionado. 
                            Puedes cancelar en cualquier momento. Al continuar, aceptas nuestros 
                            <a href="#">Términos de Servicio</a> y <a href="#">Política de Privacidad</a>.
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add to document
        document.body.insertAdjacentHTML('beforeend', modalHTML);
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

        // Method selection
        const methodOptions = document.querySelectorAll('.method-option');
        methodOptions.forEach(option => {
            option.addEventListener('click', () => this.selectMethod(option));
        });

        // Pay button
        const payButton = document.getElementById('payButton');
        payButton.addEventListener('click', () => this.processPayment());

        // Card input formatting
        this.formatCardInputs();

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    open(planData) {
        this.selectedPlan = planData;
        this.updateModalContent();
        
        const overlay = document.getElementById('paymentOverlay');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.isOpen = true;

        // Focus first input
        setTimeout(() => {
            const firstInput = document.getElementById('emailInput');
            if (firstInput) firstInput.focus();
        }, 400);
    }

    close() {
        const overlay = document.getElementById('paymentOverlay');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        this.isOpen = false;
    }

    updateModalContent() {
        if (!this.selectedPlan) return;

        const planNameEl = document.getElementById('selectedPlanName');
        const priceAmountEl = document.getElementById('priceAmount');
        const monthlyPriceEl = document.getElementById('monthlyPrice');

        planNameEl.textContent = this.selectedPlan.name;
        priceAmountEl.textContent = '$0';
        monthlyPriceEl.textContent = '$0.00';

        // Update plan selected badge color
        const planSelectedEl = document.getElementById('planSelected');
        planSelectedEl.className = `plan-selected ${this.selectedPlan.type}`;
    }

    selectMethod(optionElement) {
        // Remove selected from all options
        document.querySelectorAll('.method-option').forEach(opt => {
            opt.classList.remove('selected');
        });

        // Add selected to clicked option
        optionElement.classList.add('selected');
        this.selectedMethod = optionElement.dataset.method;

        // Show/hide payment form based on method
        const paymentForm = document.getElementById('paymentForm');
        const payButton = document.getElementById('payButton');
        
        if (this.selectedMethod === 'stripe') {
            paymentForm.style.display = 'block';
            payButton.innerHTML = `
                <div class="spinner"></div>
                <span class="pay-text">
                    <i class="fas fa-rocket"></i>
                    Comenzar Prueba Gratuita
                </span>
            `;
        } else {
            paymentForm.style.display = 'none';
            const methodNames = {
                paypal: 'PayPal',
                apple: 'Apple Pay',
                google: 'Google Pay'
            };
            const methodIcons = {
                paypal: 'fab fa-paypal',
                apple: 'fab fa-apple',
                google: 'fab fa-google'
            };
            
            payButton.innerHTML = `
                <div class="spinner"></div>
                <span class="pay-text">
                    <i class="${methodIcons[this.selectedMethod]}"></i>
                    Continuar con ${methodNames[this.selectedMethod]}
                </span>
            `;
        }

        // Add ripple effect
        this.addRipple(optionElement);
    }

    formatCardInputs() {
        const cardInput = document.getElementById('cardInput');
        const expiryInput = document.getElementById('expiryInput');
        const cvvInput = document.getElementById('cvvInput');

        // Card number formatting
        cardInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = '';
            
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) {
                    formattedValue += ' ';
                }
                formattedValue += value[i];
            }
            
            e.target.value = formattedValue;
        });

        // Expiry formatting
        expiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
        });

        // CVV numeric only
        cvvInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }

    processPayment() {
        const payButton = document.getElementById('payButton');
        
        // Add processing state
        payButton.classList.add('processing');
        
        // Simulate processing time
        setTimeout(() => {
            payButton.classList.remove('processing');
            this.showSuccessMessage();
            this.close();
        }, 2500);
    }

    showSuccessMessage() {
        // Create brief success notification
        const successHTML = `
            <div class="payment-overlay active" id="successOverlay" style="z-index: 10001;">
                <div class="payment-modal" style="transform: scale(1); max-width: 400px;">
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
                        <h2 class="payment-title">¡Pago Procesado!</h2>
                        <p class="payment-subtitle">Ahora vamos a crear tu cuenta</p>
                    </div>
                    <div class="payment-body" style="text-align: center; padding: 1rem 2rem 2rem 2rem;">
                        <div style="
                            background: rgba(52, 211, 153, 0.1);
                            border: 1px solid rgba(52, 211, 153, 0.3);
                            border-radius: 12px;
                            padding: 1rem;
                            margin-bottom: 1.5rem;
                        ">
                            <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">
                                Tu plan <strong style="color: #34d399;">${this.selectedPlan?.name || 'seleccionado'}</strong> 
                                está listo. Solo necesitamos algunos datos más.
                            </p>
                        </div>
                        
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 0.5rem;
                            color: var(--text-secondary);
                            font-size: 0.9rem;
                        ">
                            <div style="
                                width: 20px;
                                height: 20px;
                                border: 2px solid var(--primary-color);
                                border-radius: 50%;
                                border-top: 2px solid transparent;
                                animation: spin 1s linear infinite;
                            "></div>
                            <span>Preparando registro...</span>
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
                    0% { transform: scale(0); }
                    50% { transform: scale(1.2); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
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
            
            // Redirect to new onboarding page
            window.location.href = 'onboarding-new.html';
        }, 2500);
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
            background: rgba(253, 98, 79, 0.3);
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

document.addEventListener('DOMContentLoaded', function() {
    paymentModal = new PaymentModal();
});

// Function to open payment modal (called from planes.js)
function openPaymentModal(planData) {
    if (paymentModal) {
        paymentModal.open(planData);
    }
}

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