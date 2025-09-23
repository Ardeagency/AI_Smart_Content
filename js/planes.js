// Planes Page - Specific JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initPlanesPage();
    initFAQAccordion();
    initPlanAnimations();
    initPlanSelection();
    
    // Initialize CTA buttons with delay to ensure payment modal is loaded
    setTimeout(() => {
        initCTAButtons();
    }, 100);
});

function initPlanesPage() {
    // Add active class to navigation
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === 'planes.html') {
            link.classList.add('active');
        }
    });

    // Animate plan cards on scroll
    const planCards = document.querySelectorAll('.plan-card');
    
    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px 0px -50px 0px'
    };

    const planObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    planCards.forEach((card, index) => {
        // Initial state
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px)';
        card.style.transition = `all 0.6s ease ${index * 0.2}s`;
        
        planObserver.observe(card);
    });
}

function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all other FAQ items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });

            // Toggle current item
            if (isActive) {
                item.classList.remove('active');
            } else {
                item.classList.add('active');
            }
        });
    });
}

function initPlanAnimations() {
    const planCards = document.querySelectorAll('.plan-card');

    planCards.forEach(card => {
        // Enhanced hover effects
        card.addEventListener('mouseenter', () => {
            // Add glow effect based on plan type
            if (card.classList.contains('starter')) {
                card.style.boxShadow = '0 30px 80px rgba(52, 211, 153, 0.3)';
            } else if (card.classList.contains('pro')) {
                card.style.boxShadow = '0 30px 80px rgba(253, 98, 79, 0.4)';
            } else if (card.classList.contains('enterprise')) {
                card.style.boxShadow = '0 30px 80px rgba(147, 51, 234, 0.3)';
            }

            // Animate features
            const features = card.querySelectorAll('.feature-section li');
            features.forEach((feature, index) => {
                setTimeout(() => {
                    feature.style.transform = 'translateX(5px)';
                    feature.style.color = 'var(--text-primary)';
                }, index * 50);
            });
        });

        card.addEventListener('mouseleave', () => {
            card.style.boxShadow = '';
            
            const features = card.querySelectorAll('.feature-section li');
            features.forEach(feature => {
                feature.style.transform = 'translateX(0)';
                feature.style.color = 'var(--text-secondary)';
            });
        });

        // Plan button interactions
        const planBtn = card.querySelector('.plan-btn');
        if (planBtn) {
            planBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Get plan details
                const planName = card.querySelector('.plan-name').textContent;
                const planType = card.classList.contains('starter') ? 'starter' : 
                                card.classList.contains('pro') ? 'pro' : 'enterprise';
                
                // Animate button click
                planBtn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    planBtn.style.transform = 'scale(1)';
                }, 150);
                
                // Get plan features and pricing info
                const planPricing = {
                    'starter': {
                        currentPrice: 0,
                        originalPrice: 49000,
                        features: ['1 UGC por ejecución', '1 Video HD', '1 Imagen optimizada'],
                        ugcCount: 1
                    },
                    'pro': {
                        currentPrice: 0,
                        originalPrice: 149000,
                        features: ['3 UGC por ejecución', '3 Videos HD', '3 Imágenes optimizadas', 'A/B Testing'],
                        ugcCount: 3
                    },
                    'enterprise': {
                        currentPrice: 0,
                        originalPrice: 299000,
                        features: ['6 UGC por ejecución', '6 Videos HD', '6 Imágenes optimizadas', 'Análisis avanzado'],
                        ugcCount: 6
                    }
                };

                const currentPlanInfo = planPricing[planType] || planPricing['pro'];

                // Open payment modal directly with enhanced data
                const planData = {
                    name: planName,
                    type: planType,
                    price: currentPlanInfo.currentPrice === 0 ? 'Gratis' : `$${(currentPlanInfo.currentPrice / 1000).toFixed(0)}K COP`,
                    originalPrice: currentPlanInfo.originalPrice,
                    features: currentPlanInfo.features,
                    ugcCount: currentPlanInfo.ugcCount,
                    savings: currentPlanInfo.currentPrice === 0 ? '100%' : '0%',
                    popular: planType === 'pro'
                };
                
                // Check if payment modal is available
                if (typeof openPaymentModal === 'function') {
                    openPaymentModal(planData);
                } else {
                    // Fallback to original selection modal
                    showPlanSelection(planName, planType);
                }
            });
        }
    });
}

function showPlanSelection(planName, planType) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'plan-selection-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'plan-selection-modal';
    modal.style.cssText = `
        background: var(--bg-card);
        border: 2px solid var(--primary-color);
        border-radius: 20px;
        padding: 3rem;
        max-width: 500px;
        width: 90%;
        text-align: center;
        transform: scale(0.8);
        transition: transform 0.3s ease;
        position: relative;
    `;

    // Get plan color
    let planColor = '#34d399';
    if (planType === 'pro') planColor = 'var(--primary-color)';
    if (planType === 'enterprise') planColor = '#9333ea';

    modal.innerHTML = `
        <div class="selection-icon" style="
            width: 80px;
            height: 80px;
            margin: 0 auto 1.5rem;
            background: linear-gradient(135deg, ${planColor}, ${planColor}99);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            color: white;
        ">
            <i class="fas fa-check"></i>
        </div>
        <h2 style="
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: var(--text-primary);
        ">¡Excelente Elección!</h2>
        <p style="
            font-size: 1.1rem;
            color: var(--text-secondary);
            margin-bottom: 2rem;
            line-height: 1.6;
        ">Has seleccionado el <strong style="color: ${planColor};">${planName}</strong>. 
        Te redirigiremos al proceso de configuración de tu cuenta.</p>
        <div class="modal-buttons" style="
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        ">
            <button class="btn-confirm" style="
                background: linear-gradient(135deg, ${planColor}, ${planColor}cc);
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: var(--transition);
            ">Continuar</button>
            <button class="btn-cancel" style="
                background: transparent;
                color: var(--text-secondary);
                border: 2px solid rgba(255, 255, 255, 0.2);
                padding: 1rem 2rem;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: var(--transition);
            ">Cancelar</button>
        </div>
        <button class="modal-close" style="
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 1.5rem;
            cursor: pointer;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--transition);
        ">
            <i class="fas fa-times"></i>
        </button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    setTimeout(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);

    // Add event listeners
    const confirmBtn = modal.querySelector('.btn-confirm');
    const cancelBtn = modal.querySelector('.btn-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    const closeModal = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.8)';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 300);
    };

    confirmBtn.addEventListener('click', () => {
        // Here you would typically redirect to a signup/onboarding flow
        console.log(`Selected plan: ${planName} (${planType})`);
        
        // For demo purposes, just close and show success
        closeModal();
        
        setTimeout(() => {
            showSuccessMessage(planName);
        }, 400);
    });

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Add hover effects to modal buttons
    confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.transform = 'translateY(-2px)';
        confirmBtn.style.boxShadow = `0 10px 30px ${planColor}40`;
    });

    confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.transform = 'translateY(0)';
        confirmBtn.style.boxShadow = 'none';
    });

    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    });

    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.backgroundColor = 'transparent';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });

    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        closeBtn.style.color = 'var(--text-primary)';
    });

    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.backgroundColor = 'transparent';
        closeBtn.style.color = 'var(--text-secondary)';
    });
}

function showSuccessMessage(planName) {
    // Create success notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: linear-gradient(135deg, #34d399, #10b981);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(52, 211, 153, 0.3);
        z-index: 10001;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-check-circle" style="font-size: 1.2rem;"></i>
            <div>
                <div style="font-weight: 600;">¡Perfecto!</div>
                <div style="font-size: 0.9rem; opacity: 0.9;">Plan ${planName} seleccionado</div>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function initPlanSelection() {
    // Add comparison table interactions
    const tableRows = document.querySelectorAll('.table-row');
    
    tableRows.forEach(row => {
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = 'rgba(253, 98, 79, 0.05)';
        });

        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });
    });

    // Add plan card comparison highlighting
    const planCards = document.querySelectorAll('.plan-card');
    
    planCards.forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking the button
            if (e.target.closest('.plan-btn')) return;
            
            // Remove previous highlights
            planCards.forEach(c => c.classList.remove('highlighted'));
            
            // Add highlight to clicked card
            card.classList.add('highlighted');
            
            // Scroll to comparison table if on desktop
            if (window.innerWidth > 1024) {
                const comparisonSection = document.querySelector('.features-comparison');
                if (comparisonSection) {
                    comparisonSection.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
            }
        });
    });
}

// Add highlighting styles
const highlightStyles = `
    .plan-card.highlighted {
        border-color: var(--primary-color) !important;
        box-shadow: 0 0 0 2px rgba(253, 98, 79, 0.3) !important;
        transform: translateY(-5px) !important;
    }
    
    .nav-menu a.active {
        color: var(--primary-color) !important;
    }
    
    .nav-menu a.active::after {
        width: 100% !important;
    }
`;

// Add the styles to the document
if (!document.getElementById('planes-highlight-styles')) {
    const style = document.createElement('style');
    style.id = 'planes-highlight-styles';
    style.textContent = highlightStyles;
    document.head.appendChild(style);
}

// Handle CTA button clicks
function initCTAButtons() {
    const ctaButtons = document.querySelectorAll('.cta .btn-primary');
    
    ctaButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Default to Pro plan for CTA clicks
            const defaultPlan = {
                name: 'Plan Profesional',
                type: 'pro',
                price: 'Gratis',
                originalPrice: 149000,
                features: ['3 UGC por ejecución', '3 Videos HD', '3 Imágenes optimizadas', 'A/B Testing'],
                ugcCount: 3,
                savings: '100%',
                popular: true
            };
            
            // Check if payment modal is available
            if (typeof openPaymentModal === 'function') {
                openPaymentModal(defaultPlan);
            }
        });
    });
}