// AI Smart Content - Main JavaScript File

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initNavigation();
    initAnimations();
    initInteractivity();
    initScrollEffects();
});

// Navigation functionality
function initNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navbar = document.querySelector('.navbar');

    // Mobile menu toggle
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // Navbar background on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Initialize animations and visual effects
function initAnimations() {
    // Typing animation for the terminal
    initTerminalAnimation();
    
    // Particles removed
    
    // Feature cards hover effects
    initFeatureCards();
}

// Terminal typing animation
function initTerminalAnimation() {
    const codeLines = document.querySelectorAll('.code-line');
    let delay = 0;

    codeLines.forEach((line, index) => {
        setTimeout(() => {
            line.style.opacity = '1';
            line.style.transform = 'translateX(0)';
        }, delay);
        delay += 800;
    });

    // Restart animation every 10 seconds
    setInterval(() => {
        codeLines.forEach(line => {
            line.style.opacity = '0';
            line.style.transform = 'translateX(-20px)';
        });
        
        setTimeout(() => {
            let delay = 0;
            codeLines.forEach((line, index) => {
                setTimeout(() => {
                    line.style.opacity = '1';
                    line.style.transform = 'translateX(0)';
                }, delay);
                delay += 800;
            });
        }, 500);
    }, 10000);
}

// Particles removed - no longer used

// Feature cards interactive effects
function initFeatureCards() {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            // Add glow effect
            card.style.boxShadow = '0 20px 60px rgba(210, 254, 63, 0.3)';
            
            // Animate icon
            const icon = card.querySelector('.feature-icon');
            if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
            }
        });

        card.addEventListener('mouseleave', () => {
            card.style.boxShadow = '';
            
            const icon = card.querySelector('.feature-icon');
            if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
            }
        });
    });
}

// Scroll-based animations and effects
function initScrollEffects() {
    // Intersection Observer for fade-in animations
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

    // Observe elements for animation
    const animatedElements = document.querySelectorAll('.feature-card, .demo-text, .demo-interface, .cta-content');
    animatedElements.forEach(el => {
        observer.observe(el);
    });

    // Parallax effect for floating elements
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.element');
        
        parallaxElements.forEach((element, index) => {
            const speed = 0.5 + (index * 0.2);
            const yPos = -(scrolled * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
    });
}

// Interactive button effects
function initInteractivity() {
    // Button ripple effect
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('div');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            button.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });

    // Add ripple animation CSS
    if (!document.getElementById('ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(2);
                    opacity: 0;
                }
            }
            .btn {
                position: relative;
                overflow: hidden;
            }
        `;
        document.head.appendChild(style);
    }

    // Dashboard preview interactive elements
    initDashboardPreview();
    
    // CTA button interactions
    initCTAButtons();
}

// Dashboard preview animations
function initDashboardPreview() {
    const genItems = document.querySelectorAll('.gen-item');
    
    // Animate generation items
    genItems.forEach((item, index) => {
        setTimeout(() => {
            item.style.background = 'linear-gradient(135deg, rgba(210, 254, 63, 0.2), rgba(230, 255, 95, 0.2))';
            item.innerHTML = '<div class="gen-preview"></div>';
        }, 2000 + (index * 500));
    });

    // Add generation preview styles
    if (!document.getElementById('gen-preview-styles')) {
        const style = document.createElement('style');
        style.id = 'gen-preview-styles';
        style.textContent = `
            .gen-preview {
                width: 100%;
                height: 100%;
                background: linear-gradient(45deg, #D2FE3F, var(--primary-light));
                border-radius: 6px;
                position: relative;
                overflow: hidden;
            }
            .gen-preview::after {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shine 2s ease-in-out infinite;
            }
            @keyframes shine {
                0% { transform: rotate(45deg) translateX(-100%); }
                50% { transform: rotate(45deg) translateX(100%); }
                100% { transform: rotate(45deg) translateX(100%); }
            }
        `;
        document.head.appendChild(style);
    }
}

// CTA button special effects
function initCTAButtons() {
    const ctaButtons = document.querySelectorAll('.cta .btn-primary');
    
    ctaButtons.forEach(button => {
        // Add magnetic effect on hover
        button.addEventListener('mousemove', (e) => {
            const rect = button.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            button.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px) translateY(-3px)`;
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translate(0, 0) translateY(0)';
        });
    });
}

// Add CSS animations for scroll-triggered elements
const scrollAnimationStyles = `
    .feature-card,
    .demo-text,
    .demo-interface,
    .cta-content {
        opacity: 0;
        transform: translateY(50px);
        transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .feature-card.animate-in,
    .demo-text.animate-in,
    .demo-interface.animate-in,
    .cta-content.animate-in {
        opacity: 1;
        transform: translateY(0);
    }

    .navbar.scrolled {
        background: rgba(0, 0, 0, 0.98);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(210, 254, 63, 0.3);
    }

    @media (max-width: 768px) {
        .nav-menu {
            position: fixed;
            left: -100%;
            top: 70px;
            flex-direction: column;
            background-color: rgba(0, 0, 0, 0.98);
            width: 100%;
            text-align: center;
            transition: 0.3s;
            backdrop-filter: blur(20px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-menu.active {
            left: 0;
        }

        .nav-menu li {
            margin: 1rem 0;
        }

        .hamburger.active span:nth-child(2) {
            opacity: 0;
        }

        .hamburger.active span:nth-child(1) {
            transform: translateY(8px) rotate(45deg);
        }

        .hamburger.active span:nth-child(3) {
            transform: translateY(-8px) rotate(-45deg);
        }
    }
`;

// Add the styles to the document
if (!document.getElementById('scroll-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'scroll-animation-styles';
    style.textContent = scrollAnimationStyles;
    document.head.appendChild(style);
}

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to scroll events
const debouncedScrollHandler = debounce(() => {
    const scrolled = window.pageYOffset;
    const parallaxElements = document.querySelectorAll('.element');
    
    parallaxElements.forEach((element, index) => {
        const speed = 0.5 + (index * 0.2);
        const yPos = -(scrolled * speed);
        element.style.transform = `translateY(${yPos}px)`;
    });
}, 10);

window.addEventListener('scroll', debouncedScrollHandler);