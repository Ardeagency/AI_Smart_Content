// Funcionalidad de la página de planes
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Página de planes cargada');
    
    // Inicializar funcionalidades
    initPlanTypeSelector();
    initPlanSelection();
    initFAQ();
    initScrollEffects();
});

// Función para seleccionar un plan
function selectPlan(planType) {
    console.log(`📋 Plan seleccionado: ${planType}`);
    
    // Mostrar notificación de selección
    showNotification(`Plan ${planType} seleccionado`, 'success');
    
    // Guardar selección en localStorage
    localStorage.setItem('selectedPlan', planType);
    
    // Redirigir a la página de pago
    setTimeout(() => {
        window.location.href = 'pagar.html';
    }, 1500);
}

// Inicializar selector de tipo de plan
function initPlanTypeSelector() {
    const selectorButtons = document.querySelectorAll('.selector-btn');
    
    selectorButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remover clase activa de otros botones
            selectorButtons.forEach(btn => btn.classList.remove('active'));
            
            // Agregar clase activa al botón clickeado
            this.classList.add('active');
            
            // Aquí puedes agregar lógica para cambiar los precios según el tipo
            const planType = this.dataset.type;
            console.log(`Tipo de plan seleccionado: ${planType}`);
        });
    });
}

// Inicializar selección de planes
function initPlanSelection() {
    const planButtons = document.querySelectorAll('.plan-button');
    
    planButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Obtener el tipo de plan del botón
            const planType = this.onclick.toString().match(/selectPlan\('([^']+)'\)/)[1];
            
            selectPlan(planType);
        });
    });
}

// Inicializar FAQ
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', function() {
            toggleFaq(this);
        });
    });
}

// Función para toggle FAQ
function toggleFaq(button) {
    const faqItem = button.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    
    // Cerrar todos los FAQ
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Abrir el FAQ clickeado si no estaba activo
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

// Efectos de scroll
function initScrollEffects() {
    const header = document.querySelector('.main-header');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 100) {
            header.style.background = 'rgba(26, 26, 26, 0.95)';
            header.style.backdropFilter = 'blur(10px)';
        } else {
            header.style.background = 'var(--dark-gray)';
            header.style.backdropFilter = 'none';
        }
    });
}

// Sistema de notificaciones
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Agregar estilos
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--primary-color)' : 'var(--medium-gray)'};
        color: var(--white);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px var(--shadow);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
    `;
    
    // Agregar al DOM
    document.body.appendChild(notification);
    
    // Animar entrada
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remover después de 3 segundos
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Obtener icono de notificación
function getNotificationIcon(type) {
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    return icons[type] || icons.info;
}

// Función para obtener el plan seleccionado
function getSelectedPlan() {
    return localStorage.getItem('selectedPlan') || 'basic';
}

// Función para obtener detalles del plan
function getPlanDetails(planType) {
    const plans = {
        basic: {
            name: 'Básico',
            price: 29,
            features: [
                'Hasta 10 generaciones por mes',
                '1 marca registrada',
                'Hasta 5 productos',
                'Soporte por email',
                'Plantillas básicas'
            ]
        },
        pro: {
            name: 'Pro',
            price: 79,
            features: [
                'Hasta 50 generaciones por mes',
                'Hasta 3 marcas',
                'Hasta 20 productos',
                'Soporte prioritario',
                'Plantillas avanzadas',
                'Análisis de rendimiento'
            ]
        },
        enterprise: {
            name: 'Enterprise',
            price: 199,
            features: [
                'Generaciones ilimitadas',
                'Marcas ilimitadas',
                'Productos ilimitados',
                'Soporte 24/7',
                'Plantillas personalizadas',
                'API personalizada',
                'Gerente de cuenta dedicado'
            ]
        }
    };
    
    return plans[planType] || plans.basic;
}

// Función para validar selección de plan
function validatePlanSelection(planType) {
    const validPlans = ['basic', 'pro', 'enterprise'];
    return validPlans.includes(planType);
}

// Función para calcular descuentos (si los hay)
function calculateDiscount(planType, originalPrice) {
    // Aquí se pueden implementar lógicas de descuento
    // Por ejemplo, descuentos por pago anual, promociones, etc.
    return {
        discount: 0,
        finalPrice: originalPrice
    };
}

// Función para formatear precio
function formatPrice(price) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0
    }).format(price);
}

// Función para generar resumen del plan
function generatePlanSummary(planType) {
    const plan = getPlanDetails(planType);
    const discount = calculateDiscount(planType, plan.price);
    
    return {
        name: plan.name,
        originalPrice: plan.price,
        finalPrice: discount.finalPrice,
        discount: discount.discount,
        features: plan.features,
        formattedPrice: formatPrice(discount.finalPrice)
    };
}

// Exportar funciones para uso global
window.selectPlan = selectPlan;
window.toggleFaq = toggleFaq;
window.getSelectedPlan = getSelectedPlan;
window.getPlanDetails = getPlanDetails;
window.generatePlanSummary = generatePlanSummary;
