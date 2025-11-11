/**
 * Catalog Manager - AI Smart Content
 * Maneja el catálogo de estilos de la plataforma
 */

class CatalogManager {
    constructor() {
        this.styles = [];
        this.filteredStyles = [];
        this.currentCategory = 'all';
        this.currentView = 'grid';
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.isLoading = false;
        this.init();
    }

    async init() {
        await this.loadStyles();
        this.setupEventListeners();
        this.createParticles();
        this.renderStyles();
    }

    async loadStyles() {
        try {
            this.showLoading(true);
            
            // Wait for Supabase to be ready
            await this.waitForSupabase();
            
            // Load system styles from style_templates table
            const { data: styles, error } = await window.supabaseClient.supabase
                .from('style_templates')
                .select(`
                    id,
                    name,
                    description,
                    category,
                    format,
                    preview_image_url,
                    price,
                    is_premium,
                    tags,
                    popularity_score,
                    created_at
                `)
                .eq('is_active', true)
                .order('popularity_score', { ascending: false });

            if (error) {
                console.error('Error loading styles:', error);
                this.styles = [];
                this.filteredStyles = [];
                return;
            }

            this.styles = styles || [];
            this.filteredStyles = [...this.styles];
            
        } catch (error) {
            console.error('Error in loadStyles:', error);
            this.styles = [];
            this.filteredStyles = [];
        } finally {
            this.showLoading(false);
        }
    }



    renderStyles() {
        const gallery = document.getElementById('stylesGallery');
        const empty = document.getElementById('catalogEmpty');
        const pagination = document.getElementById('catalogPagination');
        
        if (this.filteredStyles.length === 0) {
            gallery.innerHTML = '';
            empty.style.display = 'block';
            pagination.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const currentStyles = this.filteredStyles.slice(startIndex, endIndex);

        // Render styles
        const stylesHTML = currentStyles.map(style => this.createStyleCard(style)).join('');
        gallery.innerHTML = stylesHTML;
        gallery.className = `styles-gallery ${this.currentView}-view`;

        // Update pagination
        this.updatePagination();
    }

    createStyleCard(style) {
        const formattedPrice = style.price > 0 ? `$${style.price}` : 'Gratis';
        const createdDate = new Date(style.created_at).toLocaleDateString();
        const tagsHTML = style.tags ? style.tags.map(tag => `<span class="style-tag">#${tag}</span>`).join('') : '';

        return `
            <div class="style-card" data-style-id="${style.id}" data-category="${style.category}">
                <div class="style-image-container">
                    <img src="${style.preview_image_url}" alt="${style.name}" class="style-image">
                    <div class="style-overlay">
                        <div class="style-actions">
                            <button class="style-action-btn" onclick="previewStyle('${style.id}')" title="Vista previa">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="style-action-btn" onclick="favoriteStyle('${style.id}')" title="Favorito">
                                <i class="fas fa-heart"></i>
                            </button>
                            <button class="style-action-btn" onclick="useStyle('${style.id}')" title="Usar estilo">
                                <i class="fas fa-magic"></i>
                            </button>
                        </div>
                        <div class="style-format-badge">${this.getFormatLabel(style.format)}</div>
                        ${style.is_premium ? '<div class="style-premium-badge"><i class="fas fa-crown"></i></div>' : ''}
                    </div>
                </div>

                <div class="style-content">
                    <div class="style-header">
                        <h3 class="style-name">${this.escapeHtml(style.name)}</h3>
                        <div class="style-price ${style.price === 0 ? 'free' : ''}">${formattedPrice}</div>
                    </div>

                    <p class="style-description">${this.escapeHtml(style.description)}</p>

                    <div class="style-tags">
                        ${tagsHTML}
                    </div>

                    <div class="style-footer">
                        <div class="style-stats">
                            <div class="style-stat">
                                <i class="fas fa-heart"></i>
                                <span>${Math.floor(style.popularity_score / 10)}</span>
                            </div>
                            <div class="style-stat">
                                <i class="fas fa-download"></i>
                                <span>${Math.floor(style.popularity_score / 5)}</span>
                            </div>
                        </div>
                        <button class="style-use-btn" onclick="useStyle('${style.id}')">
                            ${style.price > 0 ? 'Comprar' : 'Usar Gratis'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('catalogSearch');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.filterStyles(e.target.value);
                }, 300);
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filterByCategory(e.target.value);
            });
        }

        // Format filter
        const formatFilter = document.getElementById('formatFilter');
        if (formatFilter) {
            formatFilter.addEventListener('change', (e) => {
                this.filterByFormat(e.target.value);
            });
        }

        // Category chips
        const categoryChips = document.querySelectorAll('.category-chip');
        categoryChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const category = chip.dataset.category;
                this.selectCategory(category);
            });
        });

        // View toggle
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.changeView(view);
            });
        });

        // Infinite scroll (optional)
        window.addEventListener('scroll', () => {
            if (this.isNearBottom() && !this.isLoading) {
                this.loadMoreStyles();
            }
        });
    }

    filterStyles(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredStyles = this.styles.filter(style => 
            style.name.toLowerCase().includes(term) ||
            style.description.toLowerCase().includes(term) ||
            (style.tags && style.tags.some(tag => tag.toLowerCase().includes(term))) ||
            style.category.toLowerCase().includes(term)
        );
        
        this.currentPage = 1;
        this.renderStyles();
    }

    filterByCategory(category) {
        if (category === 'all') {
            this.filteredStyles = [...this.styles];
        } else {
            this.filteredStyles = this.styles.filter(style => style.category === category);
        }
        
        this.currentPage = 1;
        this.renderStyles();
    }

    filterByFormat(format) {
        if (format === 'all') {
            this.filteredStyles = [...this.styles];
        } else {
            this.filteredStyles = this.styles.filter(style => style.format === format);
        }
        
        this.currentPage = 1;
        this.renderStyles();
    }

    selectCategory(category) {
        this.currentCategory = category;
        
        // Update active state
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        this.filterByCategory(category);
    }

    changeView(view) {
        this.currentView = view;
        
        // Update active state
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        this.renderStyles();
    }

    updatePagination() {
        const pagination = document.getElementById('catalogPagination');
        if (!pagination) return;

        const totalItems = this.filteredStyles.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);
        
        pagination.innerHTML = `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="catalogManager.previousPage()">
                <i class="fas fa-chevron-left"></i>
                Anterior
            </button>
            <span class="pagination-info">${startItem} - ${endItem} de ${totalItems}</span>
            <button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="catalogManager.nextPage()">
                Siguiente
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderStyles();
            this.scrollToTop();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredStyles.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderStyles();
            this.scrollToTop();
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    isNearBottom() {
        return (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000;
    }

    async loadMoreStyles() {
        // This would be used for infinite scroll
        // For now, we use pagination
    }

    previewStyle(styleId) {
        const style = this.styles.find(s => s.id === styleId);
        if (!style) return;

        this.showNotification('Vista Previa', `Mostrando vista previa de: ${style.name}`, 'info');
        // Here you would implement a modal or preview functionality
    }

    favoriteStyle(styleId) {
        const style = this.styles.find(s => s.id === styleId);
        if (!style) return;

        this.showNotification('Favoritos', `${style.name} agregado a favoritos`, 'success');
        // Here you would implement favorite functionality
    }

    useStyle(styleId) {
        const style = this.styles.find(s => s.id === styleId);
        if (!style) return;

        if (style.price > 0) {
            this.showNotification('Compra', `Redirigiendo a checkout para: ${style.name}`, 'info');
            // Here you would implement purchase flow
        } else {
            this.showNotification('AI Smart Content', `Usando estilo: ${style.name}`, 'success');
            // Here you would redirect to studio with the style
        }
    }

    getFormatLabel(format) {
        const formats = {
            'vertical': '9:16',
            'square': '1:1',
            'horizontal': '16:9'
        };
        return formats[format] || format;
    }

    showLoading(show) {
        const loading = document.getElementById('catalogLoading');
        const gallery = document.getElementById('stylesGallery');
        
        if (show) {
            this.isLoading = true;
            if (loading) {
                loading.innerHTML = this.createLoadingCards();
                loading.style.display = 'grid';
            }
            if (gallery) {
                gallery.style.display = 'none';
            }
        } else {
            this.isLoading = false;
            if (loading) {
                loading.style.display = 'none';
            }
            if (gallery) {
                gallery.style.display = 'grid';
            }
        }
    }

    createLoadingCards() {
        let loadingHTML = '';
        for (let i = 0; i < 8; i++) {
            loadingHTML += `
                <div class="loading-style-card">
                    <div class="loading-style-image"></div>
                    <div class="loading-style-content">
                        <div class="loading-style-name"></div>
                        <div class="loading-style-description"></div>
                        <div class="loading-style-description short"></div>
                    </div>
                </div>
            `;
        }
        return loadingHTML;
    }

    // Utility functions
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

    showNotification(title, message, type = 'info') {
        if (window.navigationManager) {
            window.navigationManager.showNotification(title, message, type);
        } else {
            alert(`${title}: ${message}`);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;

        const particleCount = 25;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (15 + Math.random() * 10) + 's';
            
            const size = 1 + Math.random() * 2;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';

            particlesContainer.appendChild(particle);
        }
    }
}

// Global functions for HTML onclick handlers
function previewStyle(styleId) {
    if (window.catalogManager) {
        window.catalogManager.previewStyle(styleId);
    }
}

function favoriteStyle(styleId) {
    if (window.catalogManager) {
        window.catalogManager.favoriteStyle(styleId);
    }
}

function useStyle(styleId) {
    if (window.catalogManager) {
        window.catalogManager.useStyle(styleId);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.catalogManager = new CatalogManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CatalogManager;
}
