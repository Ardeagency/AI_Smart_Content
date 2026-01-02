/**
 * Sistema de Navegación AI Smart Content
 * Maneja el menú lateral, navegación y estado de la aplicación
 */

class NavigationManager {
    constructor() {
        this.isNavOpen = false;
        this.isCollapsed = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthState();
        this.updateNavigationCounts();
        this.initializeSidebar();
    }

    initializeSidebar() {
        // En desktop, el sidebar está siempre abierto
        if (window.innerWidth > 768) {
            const sideNavigation = document.getElementById('sideNavigation');
            if (sideNavigation) {
                sideNavigation.classList.add('active');
                this.isNavOpen = true;
            }
        }
        
        // Cargar estado colapsado desde localStorage
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            this.isCollapsed = true;
            const sideNavigation = document.getElementById('sideNavigation');
            const navToggleBtn = document.getElementById('navToggleBtn');
            if (sideNavigation) {
                sideNavigation.classList.add('collapsed');
                document.body.classList.add('sidebar-collapsed');
                // Actualizar icono si está colapsado
                if (navToggleBtn) {
                    const icon = navToggleBtn.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-bars');
                        icon.classList.add('fa-chevron-right');
                    }
                }
            }
        }
    }

    setupEventListeners() {
        // Hamburger menu toggle - solo funciona en móvil
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const navOverlay = document.getElementById('navOverlay');
        const sideNavigation = document.getElementById('sideNavigation');

        if (hamburgerMenu) {
            hamburgerMenu.addEventListener('click', () => {
                // Solo toggle en móvil
                if (window.innerWidth <= 768) {
                    this.toggleNavigation();
                }
            });
        }

        if (navOverlay) {
            navOverlay.addEventListener('click', () => {
                // Solo cerrar en móvil
                if (window.innerWidth <= 768) {
                    this.closeNavigation();
                }
            });
        }

        // Close nav on escape key - solo en móvil
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isNavOpen && window.innerWidth <= 768) {
                this.closeNavigation();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                // En desktop, siempre abierto
                const sideNavigation = document.getElementById('sideNavigation');
                if (sideNavigation) {
                    sideNavigation.classList.add('active');
                    this.isNavOpen = true;
                }
                // Ocultar overlay en desktop
                const navOverlay = document.getElementById('navOverlay');
                if (navOverlay) {
                    navOverlay.classList.remove('active');
                }
            } else {
                // En móvil, cerrar por defecto
                this.closeNavigation();
            }
        });

        // Navigation links
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.href === '#' || link.classList.contains('coming-soon')) {
                    e.preventDefault();
                    this.showComingSoon();
                    return;
                }
                
                // Close navigation on mobile after link click
                // En desktop, el sidebar permanece abierto
                if (window.innerWidth <= 768) {
                    this.closeNavigation();
                }
            });
        });
        
        // Toggle button para colapsar/expandir sidebar (solo desktop)
        const navToggleBtn = document.getElementById('navToggleBtn');
        if (navToggleBtn) {
            navToggleBtn.addEventListener('click', () => {
                // Solo funciona en desktop
                if (window.innerWidth > 768) {
                    this.toggleSidebarCollapse();
                }
            });
        }
    }

    toggleNavigation() {
        if (this.isNavOpen) {
            this.closeNavigation();
        } else {
            this.openNavigation();
        }
    }

    openNavigation() {
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const navOverlay = document.getElementById('navOverlay');
        const sideNavigation = document.getElementById('sideNavigation');

        this.isNavOpen = true;
        
        if (hamburgerMenu) hamburgerMenu.classList.add('active');
        if (navOverlay) navOverlay.classList.add('active');
        if (sideNavigation) sideNavigation.classList.add('active');

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    closeNavigation() {
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const navOverlay = document.getElementById('navOverlay');
        const sideNavigation = document.getElementById('sideNavigation');

        this.isNavOpen = false;
        
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        if (navOverlay) navOverlay.classList.remove('active');
        if (sideNavigation) sideNavigation.classList.remove('active');

        // Restore body scroll
        document.body.style.overflow = '';
    }

    async checkAuthState() {
        // Supabase desactivado
    }

    async updateNavigationCounts() {
        // Función mantenida para compatibilidad
        // El sidebar es persistente y se maneja por SidebarManager
    }

    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    getPlanIcon(planType) {
        const icons = {
            'starter': 'fas fa-rocket',
            'pro': 'fas fa-crown',
            'enterprise': 'fas fa-gem',
            'free': 'fas fa-star'
        };
        return icons[planType] || 'fas fa-user';
    }

    getPlanName(planType) {
        const names = {
            'starter': 'Plan Starter',
            'pro': 'Plan Pro',
            'enterprise': 'Plan Enterprise',
            'free': 'Plan Gratuito'
        };
        return names[planType] || 'Plan Básico';
    }

    showComingSoon() {
        // Create coming soon notification
        this.showNotification('¡Próximamente!', 'Esta funcionalidad estará disponible muy pronto.', 'info');
    }

    showNotification(title, message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    <i class="fas fa-${type === 'info' ? 'info-circle' : type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
                </div>
                <div>
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => this.removeNotification(notification), 5000);

        // Handle close button
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.removeNotification(notification));
        }
    }

    removeNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    // Update active navigation link based on current page
    updateActiveLink() {
        const currentPage = window.location.pathname.split('/').pop();
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href && href.includes(currentPage)) {
                link.classList.add('active');
            }
        });
    }
    
    // Toggle sidebar collapse/expand (solo desktop)
    toggleSidebarCollapse() {
        const sideNavigation = document.getElementById('sideNavigation');
        const navToggleBtn = document.getElementById('navToggleBtn');
        if (!sideNavigation) return;
        
        this.isCollapsed = !this.isCollapsed;
        
        if (this.isCollapsed) {
            sideNavigation.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
            // Cambiar icono a chevron-right cuando está colapsado
            if (navToggleBtn) {
                const icon = navToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-chevron-right');
                }
            }
        } else {
            sideNavigation.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
            // Cambiar icono a bars cuando está expandido
            if (navToggleBtn) {
                const icon = navToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevron-right');
                    icon.classList.add('fa-bars');
                }
            }
        }
        
        // Guardar estado en localStorage
        localStorage.setItem('sidebarCollapsed', this.isCollapsed.toString());
        
        // Actualizar header y main-content
        this.updateLayoutForCollapse();
    }
    
    updateLayoutForCollapse() {
        const mainHeader = document.querySelector('.main-header');
        const mainContent = document.querySelector('.main-content');
        
        // Los estilos CSS se encargan del ajuste automático
        // pero podemos forzar un reflow si es necesario
        if (mainHeader) {
            mainHeader.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
        if (mainContent) {
            mainContent.style.transition = 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
    }
}

async function logout() {
    window.location.href = 'login.html';
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.navigationManager = new NavigationManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}
