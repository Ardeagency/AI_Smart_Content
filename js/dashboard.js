// Dashboard JavaScript - Inspired by Artlist.io

class UGCDashboard {
    constructor() {
        this.currentPage = 'panel';
        this.selectedStyles = new Set();
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.userData = null;
        
        this.init();
    }

    init() {
        this.loadUserData();
        this.bindEvents();
        this.loadStylesData();
        this.initializeFilters();
        this.showWelcomeMessage();
    }

    loadUserData() {
        try {
            const userData = localStorage.getItem('ugc_user_data');
            if (userData) {
                this.userData = JSON.parse(userData);
                console.log('User data loaded:', this.userData);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    bindEvents() {
        // Navigation events
        this.bindNavigationEvents();
        
        // Search and filter events
        this.bindSearchEvents();
        
        // Style card events
        this.bindStyleCardEvents();
        
        // Modal events
        this.bindModalEvents();
        
        // User menu events
        this.bindUserMenuEvents();
    }

    bindNavigationEvents() {
        // Slide menu navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigateToPage(page);
                this.closeSlideMenu();
            });
        });

        // Menu toggle events
        this.bindMenuToggleEvents();

        // Generate UGC button
        const generateBtn = document.querySelector('.btn-generate');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.showGenerateModal();
            });
        }

        // Add test link for new onboarding (temporary)
        if (window.location.hash === '#test-onboarding') {
            const testBtn = document.createElement('button');
            testBtn.textContent = 'Probar Nuevo Onboarding';
            testBtn.style.cssText = 'position: fixed; top: 200px; right: 20px; z-index: 1000; padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;';
            testBtn.addEventListener('click', () => {
                window.location.href = 'onboarding-new.html';
            });
            document.body.appendChild(testBtn);
        }
    }

    bindMenuToggleEvents() {
        const menuToggle = document.getElementById('menuToggle');
        const menuClose = document.getElementById('menuClose');
        const menuOverlay = document.getElementById('menuOverlay');
        const slideMenu = document.getElementById('slideMenu');

        // Open menu
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                this.openSlideMenu();
            });
        }

        // Close menu
        if (menuClose) {
            menuClose.addEventListener('click', () => {
                this.closeSlideMenu();
            });
        }

        // Close on overlay click
        if (menuOverlay) {
            menuOverlay.addEventListener('click', () => {
                this.closeSlideMenu();
            });
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && slideMenu.classList.contains('open')) {
                this.closeSlideMenu();
            }
        });
    }

    openSlideMenu() {
        const slideMenu = document.getElementById('slideMenu');
        const menuOverlay = document.getElementById('menuOverlay');
        
        if (slideMenu && menuOverlay) {
            slideMenu.classList.add('open');
            menuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeSlideMenu() {
        const slideMenu = document.getElementById('slideMenu');
        const menuOverlay = document.getElementById('menuOverlay');
        
        if (slideMenu && menuOverlay) {
            slideMenu.classList.remove('open');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    bindSearchEvents() {
        // Search input
        const searchInput = document.getElementById('styleSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterStyles();
            });
        }

        // Filter tags
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                // Remove active class from all tags
                document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tag
                tag.classList.add('active');
                
                // Update filter
                this.currentFilter = tag.dataset.filter;
                this.filterStyles();
            });
        });
    }

    bindStyleCardEvents() {
        // Style card clicks
        document.querySelectorAll('.style-card').forEach(card => {
            card.addEventListener('click', () => {
                this.openStyleModal(card.dataset.style);
            });
        });

        // Load more button
        const loadMoreBtn = document.querySelector('.btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.loadMoreStyles();
            });
        }
    }

    bindModalEvents() {
        // Modal close events
        const modalOverlay = document.getElementById('styleModal');
        const modalClose = document.querySelector('.modal-close');
        
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeModal();
            });
        }
        
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeModal();
                }
            });
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    bindUserMenuEvents() {
        // User avatar dropdown
        const userAvatar = document.querySelector('.user-avatar');
        const dropdownMenu = document.querySelector('.dropdown-menu');
        
        if (userAvatar && dropdownMenu) {
            // Keep dropdown open on hover
            let hoverTimeout;
            
            const showDropdown = () => {
                clearTimeout(hoverTimeout);
                dropdownMenu.style.opacity = '1';
                dropdownMenu.style.visibility = 'visible';
                dropdownMenu.style.transform = 'translateY(0)';
            };
            
            const hideDropdown = () => {
                hoverTimeout = setTimeout(() => {
                    dropdownMenu.style.opacity = '0';
                    dropdownMenu.style.visibility = 'hidden';
                    dropdownMenu.style.transform = 'translateY(-10px)';
                }, 300);
            };
            
            userAvatar.addEventListener('mouseenter', showDropdown);
            userAvatar.addEventListener('mouseleave', hideDropdown);
            dropdownMenu.addEventListener('mouseenter', showDropdown);
            dropdownMenu.addEventListener('mouseleave', hideDropdown);
        }
    }

    navigateToPage(page) {
        // Update slide menu active state
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeMenuItem = document.querySelector(`.menu-item[data-page="${page}"]`);
        if (activeMenuItem) {
            activeMenuItem.classList.add('active');
        }
        
        // Hide all page contents
        document.querySelectorAll('.page-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show target page
        const targetPage = document.getElementById(`${page}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        this.currentPage = page;
        
        // Update page title in browser
        document.title = `${page.charAt(0).toUpperCase() + page.slice(1)} - UGC Studio`;
    }

    loadStylesData() {
        // This would typically load from an API
        this.stylesData = {
            'multipurpose': {
                name: 'Multipurpose',
                description: 'Genera increíbles visuales en cualquier estilo — simplemente describe tu look deseado en el prompt.',
                tags: ['cinematic', 'lifestyle'],
                images: [
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1468413253725-0d5181091126?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop'
                ],
                videos: [
                    'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&h=300&fit=crop'
                ]
            },
            'studio-portrait': {
                name: 'Studio Portrait',
                description: 'Retratos profesionales perfectos para e-commerce y moda.',
                tags: ['fashion', 'beauty'],
                images: [
                    'https://images.unsplash.com/photo-1494790108755-2616c27484e5?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=300&fit=crop'
                ]
            },
            'macro-lens': {
                name: 'Macro Lens',
                description: 'Captura detalles extremos con precisión cinematográfica.',
                tags: ['product', 'tech'],
                images: [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
                    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=300&fit=crop'
                ]
            }
        };
    }

    initializeFilters() {
        this.filterStyles();
    }

    filterStyles() {
        const styleCards = document.querySelectorAll('.style-card');
        
        styleCards.forEach(card => {
            const tags = card.dataset.tags || '';
            const styleName = card.querySelector('.style-name').textContent.toLowerCase();
            
            const matchesFilter = this.currentFilter === 'all' || tags.includes(this.currentFilter);
            const matchesSearch = this.searchTerm === '' || 
                                styleName.includes(this.searchTerm) ||
                                tags.includes(this.searchTerm);
            
            if (matchesFilter && matchesSearch) {
                card.style.display = 'block';
                card.style.animation = 'fadeInUp 0.5s ease forwards';
            } else {
                card.style.display = 'none';
            }
        });
    }

    openStyleModal(styleId) {
        const modal = document.getElementById('styleModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalGrid = document.getElementById('modalGrid');
        
        if (!modal || !this.stylesData[styleId]) return;
        
        const styleData = this.stylesData[styleId];
        
        // Update modal title
        modalTitle.textContent = styleData.name;
        
        // Clear and populate modal grid
        modalGrid.innerHTML = '';
        
        // Add images
        styleData.images?.forEach((imageUrl, index) => {
            const modalItem = document.createElement('div');
            modalItem.className = 'modal-item';
            
            modalItem.innerHTML = `
                <img src="${imageUrl}" alt="${styleData.name} ${index + 1}">
                <div class="modal-item-overlay">
                    <button class="play-btn">
                        <i class="fas fa-expand"></i>
                    </button>
                </div>
            `;
            
            modalGrid.appendChild(modalItem);
        });
        
        // Add videos if any
        styleData.videos?.forEach((videoUrl, index) => {
            const modalItem = document.createElement('div');
            modalItem.className = 'modal-item';
            
            modalItem.innerHTML = `
                <img src="${videoUrl}" alt="${styleData.name} Video ${index + 1}">
                <div class="modal-item-overlay">
                    <button class="play-btn">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="video-indicator">
                    <i class="fas fa-video"></i>
                    VIDEO
                </div>
            `;
            
            modalGrid.appendChild(modalItem);
        });
        
        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Mark style as selected
        this.selectStyle(styleId);
    }

    closeModal() {
        const modal = document.getElementById('styleModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    selectStyle(styleId) {
        // Remove previous selections
        document.querySelectorAll('.style-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add selection to current style
        const styleCard = document.querySelector(`[data-style="${styleId}"]`);
        if (styleCard) {
            styleCard.classList.add('selected');
        }
        
        this.selectedStyles.clear();
        this.selectedStyles.add(styleId);
        
        // Notify UGC Generator about style selection
        if (window.ugcGenerator && this.stylesData[styleId]) {
            window.ugcGenerator.setSelectedStyle({
                id: styleId,
                name: this.stylesData[styleId].name,
                description: this.stylesData[styleId].description,
                tags: this.stylesData[styleId].tags
            });
        }
        
        console.log('Style selected:', styleId);
    }

    loadMoreStyles() {
        // Simulate loading more styles
        const stylesGrid = document.querySelector('.styles-grid');
        const loadMoreBtn = document.querySelector('.btn-load-more');
        
        if (!stylesGrid || !loadMoreBtn) return;
        
        // Show loading state
        loadMoreBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Cargando...
        `;
        
        loadMoreBtn.disabled = true;
        
        // Simulate API call delay
        setTimeout(() => {
            // Add new style cards (this would come from API)
            const newStyles = [
                {
                    id: 'vintage-film',
                    name: 'Vintage Film',
                    description: 'Estética retro cinematográfica',
                    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=300&fit=crop',
                    tags: 'cinematic,vintage'
                },
                {
                    id: 'modern-minimal',
                    name: 'Modern Minimal',
                    description: 'Diseño limpio y contemporáneo',
                    image: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400&h=300&fit=crop',
                    tags: 'minimal,modern'
                }
            ];
            
            newStyles.forEach(style => {
                const styleCard = this.createStyleCard(style);
                stylesGrid.insertBefore(styleCard, loadMoreBtn.parentElement);
            });
            
            // Reset button
            loadMoreBtn.innerHTML = `
                <i class="fas fa-plus"></i>
                Cargar más estilos
            `;
            loadMoreBtn.disabled = false;
            
            // Rebind events for new cards
            this.bindStyleCardEvents();
            
        }, 1500);
    }

    createStyleCard(style) {
        const card = document.createElement('div');
        card.className = 'style-card';
        card.dataset.style = style.id;
        card.dataset.tags = style.tags;
        
        card.innerHTML = `
            <div class="card-media">
                <img src="${style.image}" alt="${style.name}">
                <div class="media-overlay">
                    <button class="play-btn">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="selected-indicator">
                    <i class="fas fa-check"></i>
                    Seleccionado
                </div>
            </div>
            <div class="card-content">
                <h3 class="style-name">${style.name}</h3>
                <p class="style-description">${style.description}</p>
                <div class="style-tags">
                    ${style.tags.split(',').map(tag => `<span class="tag">${tag.toUpperCase()}</span>`).join('')}
                </div>
            </div>
        `;
        
        // Add click event
        card.addEventListener('click', () => {
            this.openStyleModal(style.id);
        });
        
        return card;
    }

    showGenerateModal() {
        // This would show a modal for UGC generation
        console.log('Generate UGC modal would open here');
        
        // For now, show a simple alert
        this.showNotification('¡Funcionalidad de generación próximamente!', 'info');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const iconMap = {
            'info': 'info-circle',
            'success': 'check-circle',
            'warning': 'exclamation-triangle',
            'error': 'times-circle'
        };
        
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem;
            z-index: 3000;
            min-width: 300px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    showWelcomeMessage() {
        // Update user info in slide menu
        this.updateUserInfo();
        
        if (this.userData && this.userData.completedAt) {
            const isNewUser = new Date() - new Date(this.userData.completedAt) < 60000; // Within last minute
            
            if (isNewUser) {
                setTimeout(() => {
                    const userName = this.userData.formData?.nombre_marca || 'Usuario';
                    this.showNotification(`¡Bienvenido a UGC Studio, ${userName}!`, 'success');
                }, 1000);
            }
        }
    }

    updateUserInfo() {
        const userNameElement = document.querySelector('.user-name');
        const userPlanElement = document.querySelector('.user-plan');
        
        if (userNameElement && this.userData?.formData?.nombre_marca) {
            userNameElement.textContent = this.userData.formData.nombre_marca;
        }
        
        if (userPlanElement) {
            // You could get this from user data or default to Pro
            const plan = this.userData?.plan || 'Pro';
            userPlanElement.textContent = `Plan ${plan}`;
        }
    }
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-primary);
    }
    
    .notification-info .notification-content i {
        color: var(--success-color);
    }
    
    .notification-success .notification-content i {
        color: var(--success-color);
    }
    
    .notification-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.3s ease;
    }
    
    .notification-close:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.1);
    }
    
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;

document.head.appendChild(notificationStyles);

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UGCDashboard();
});