// ===== JAVASCRIPT PARA LANDING PAGE =====

class LandingPage {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.initScrollEffects();
        this.initAnimations();
        this.checkAuthStatus();
    }

    bindEvents() {
        // Smooth scrolling para enlaces de navegación
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Efectos de hover en tarjetas
        document.querySelectorAll('.feature-card, .pricing-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-8px)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
            });
        });

        // Efectos de hover en botones
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'translateY(-2px)';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translateY(0)';
            });
        });
    }

    initScrollEffects() {
        // Header transparente al hacer scroll
        window.addEventListener('scroll', () => {
            const header = document.querySelector('.main-header');
            if (window.scrollY > 100) {
                header.style.background = 'rgba(15, 23, 42, 0.98)';
                header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
            } else {
                header.style.background = 'rgba(15, 23, 42, 0.95)';
                header.style.boxShadow = 'none';
            }
        });

        // Animaciones al hacer scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);

        // Observar elementos para animaciones
        document.querySelectorAll('.feature-card, .step, .pricing-card').forEach(el => {
            observer.observe(el);
        });
    }

    initAnimations() {
        // Animación de números en estadísticas
        this.animateNumbers();
        
        // Animación de gradiente en el texto
        this.animateGradientText();
        
        // Efectos de parallax suave
        this.initParallax();
    }

    animateNumbers() {
        const stats = document.querySelectorAll('.stat-number');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animateNumber(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        stats.forEach(stat => observer.observe(stat));
    }

    animateNumber(element) {
        const target = parseInt(element.textContent.replace(/[^\d]/g, ''));
        const duration = 2000;
        const start = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(progress * target);
            const suffix = element.textContent.replace(/[\d]/g, '');
            
            element.textContent = current.toLocaleString() + suffix;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    animateGradientText() {
        const gradientText = document.querySelector('.gradient-text');
        if (!gradientText) return;

        let hue = 0;
        const animate = () => {
            hue = (hue + 1) % 360;
            gradientText.style.background = `linear-gradient(135deg, hsl(${hue}, 70%, 60%) 0%, hsl(${(hue + 60) % 360}, 70%, 60%) 100%)`;
            gradientText.style.webkitBackgroundClip = 'text';
            gradientText.style.webkitTextFillColor = 'transparent';
            gradientText.style.backgroundClip = 'text';
            requestAnimationFrame(animate);
        };
        
        // Iniciar animación después de un delay
        setTimeout(animate, 1000);
    }

    initParallax() {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const hero = document.querySelector('.hero');
            if (hero) {
                hero.style.transform = `translateY(${scrolled * 0.5}px)`;
            }
        });
    }

    checkAuthStatus() {
        // Verificar si el usuario está autenticado
        const savedAuth = localStorage.getItem('ugc_studio_auth');
        if (savedAuth) {
            const authData = JSON.parse(savedAuth);
            if (authData.token && authData.expiresAt > Date.now()) {
                this.updateUIForAuthenticatedUser(authData.user);
            }
        }
    }

    updateUIForAuthenticatedUser(user) {
        // Actualizar botones para usuario autenticado
        const loginBtn = document.querySelector('a[href="login.html"]');
        const registerBtn = document.querySelector('a[href="configuracion.html"]');
        
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-user"></i> Mi Cuenta';
            loginBtn.href = 'dashboard.html';
        }
        
        if (registerBtn) {
            registerBtn.innerHTML = '<i class="fas fa-plus"></i> Crear Contenido';
            registerBtn.href = 'studio.html';
        }

        // Mostrar mensaje de bienvenida
        this.showWelcomeMessage(user);
    }

    showWelcomeMessage(user) {
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        welcomeMessage.innerHTML = `
            <div class="welcome-content">
                <i class="fas fa-check-circle"></i>
                <span>¡Bienvenido de vuelta, ${user.name || user.email}!</span>
                <button onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        welcomeMessage.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #22c55e;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(welcomeMessage);
        
        // Remover después de 5 segundos
        setTimeout(() => {
            if (document.body.contains(welcomeMessage)) {
                welcomeMessage.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => {
                    if (document.body.contains(welcomeMessage)) {
                        document.body.removeChild(welcomeMessage);
                    }
                }, 300);
            }
        }, 5000);
    }

    // Método para mostrar demo
    showDemo() {
        const demoModal = document.createElement('div');
        demoModal.className = 'demo-modal';
        demoModal.innerHTML = `
            <div class="demo-content">
                <div class="demo-header">
                    <h3>Demo de UGC STUDIO</h3>
                    <button class="demo-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="demo-body">
                    <div class="demo-video">
                        <div class="video-placeholder">
                            <i class="fas fa-play-circle"></i>
                            <p>Video demo en desarrollo</p>
                        </div>
                    </div>
                    <div class="demo-actions">
                        <a href="configuracion.html" class="btn btn-primary">
                            <i class="fas fa-rocket"></i>
                            Probar Ahora
                        </a>
                        <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        demoModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease-out;
        `;
        
        document.body.appendChild(demoModal);
    }

    // Método para tracking de eventos
    trackEvent(eventName, properties = {}) {
        console.log('Event tracked:', eventName, properties);
        // Aquí se integraría con Google Analytics, Mixpanel, etc.
    }
}

// Funciones globales
function showDemo() {
    if (window.landingPage) {
        window.landingPage.showDemo();
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.landingPage = new LandingPage();
    
    // Tracking de eventos
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.trim();
            window.landingPage.trackEvent('button_click', { action });
        });
    });
});

// Agregar estilos de animación
const style = document.createElement('style');
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
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    .welcome-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .welcome-content button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: background 0.3s ease;
    }
    
    .welcome-content button:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .demo-modal {
        backdrop-filter: blur(5px);
    }
    
    .demo-content {
        background: white;
        border-radius: 16px;
        max-width: 800px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        animation: slideInUp 0.3s ease-out;
    }
    
    .demo-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid var(--border-color);
    }
    
    .demo-header h3 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
    }
    
    .demo-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 6px;
        transition: all 0.3s ease;
    }
    
    .demo-close:hover {
        background: var(--secondary-bg);
        color: var(--text-primary);
    }
    
    .demo-body {
        padding: 2rem;
    }
    
    .demo-video {
        margin-bottom: 2rem;
    }
    
    .video-placeholder {
        background: var(--secondary-bg);
        border: 2px dashed var(--border-color);
        border-radius: 12px;
        padding: 4rem 2rem;
        text-align: center;
        color: var(--text-secondary);
    }
    
    .video-placeholder i {
        font-size: 3rem;
        margin-bottom: 1rem;
        color: var(--accent-color);
    }
    
    .demo-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
    }
    
    @keyframes slideInUp {
        from {
            transform: translateY(30px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    .animate-in {
        animation: fadeInUp 0.6s ease-out;
    }
    
    @media (max-width: 768px) {
        .demo-content {
            margin: 1rem;
        }
        
        .demo-header {
            padding: 1.5rem 1.5rem 1rem;
        }
        
        .demo-body {
            padding: 1.5rem;
        }
        
        .demo-actions {
            flex-direction: column;
        }
    }
`;
document.head.appendChild(style);
