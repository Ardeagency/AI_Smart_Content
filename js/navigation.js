/**
 * Sistema de Navegación UGC Studio
 * Maneja el menú lateral, navegación y estado de la aplicación
 */

class NavigationManager {
    constructor() {
        this.isNavOpen = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthState();
        this.updateNavigationCounts();
    }

    setupEventListeners() {
        // Hamburger menu toggle
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const navOverlay = document.getElementById('navOverlay');
        const sideNavigation = document.getElementById('sideNavigation');

        if (hamburgerMenu) {
            hamburgerMenu.addEventListener('click', () => this.toggleNavigation());
        }

        if (navOverlay) {
            navOverlay.addEventListener('click', () => this.closeNavigation());
        }

        // Close nav on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isNavOpen) {
                this.closeNavigation();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.isNavOpen) {
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
                if (window.innerWidth <= 768) {
                    this.closeNavigation();
                }
            });
        });
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
        try {
            // Wait for Supabase to be ready
            await this.waitForSupabase();
            
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            this.loadUserInfo(session.user);
        } catch (error) {
            console.error('Error checking auth state:', error);
            window.location.href = 'login.html';
        }
    }

    async waitForSupabase() {
        let attempts = 0;
        while ((!window.supabaseClient || !window.supabaseClient.isReady()) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!window.supabaseClient || !window.supabaseClient.isReady()) {
            throw new Error('Supabase not available');
        }
    }

    async loadUserInfo(user) {
        try {
            // Load user profile
            const { data: profile } = await window.supabaseClient.supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', user.id)
                .single();

            // Update navigation user info
            const navUserName = document.getElementById('navUserName');
            const navUserAvatar = document.getElementById('navUserAvatar');
            const navUserPlan = document.getElementById('navUserPlan');

            if (navUserName) {
                const displayName = profile?.full_name || user.user_metadata?.full_name || user.email;
                navUserName.textContent = displayName;
            }

            if (navUserAvatar) {
                const initials = this.getInitials(profile?.full_name || user.user_metadata?.full_name || user.email);
                navUserAvatar.textContent = initials;
            }

            if (navUserPlan && profile) {
                const planIcon = this.getPlanIcon(profile.plan_type);
                const planName = this.getPlanName(profile.plan_type);
                navUserPlan.innerHTML = `<i class="${planIcon}"></i><span>${planName}</span>`;
            }

        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    async updateNavigationCounts() {
        try {
            await this.waitForSupabase();
            
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
            if (!session) return;

            // Update brands count
            const { count: brandsCount } = await window.supabaseClient.supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', session.user.id);

            // Update UI
            const brandsCountEl = document.getElementById('brandsCount');

            if (brandsCountEl) {
                brandsCountEl.textContent = brandsCount || 0;
            }

            // Library count removed - library page no longer exists

        } catch (error) {
            console.error('Error updating navigation counts:', error);
        }
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
}

// Global logout function
async function logout() {
    try {
        if (window.supabaseClient && window.supabaseClient.supabase) {
            await window.supabaseClient.supabase.auth.signOut();
        }
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error during logout:', error);
        window.location.href = 'login.html';
    }
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.navigationManager = new NavigationManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}
