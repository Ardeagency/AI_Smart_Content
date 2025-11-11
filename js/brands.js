/**
 * Brands Manager - AI Smart Content
 * Maneja la gestión de marcas del usuario
 */

class BrandsManager {
    constructor() {
        this.brands = [];
        this.filteredBrands = [];
        this.currentBrandId = null;
        this.isLoading = false;
        this.init();
    }

    async init() {
        await this.loadBrands();
        this.setupEventListeners();
    }

    async loadBrands() {
        try {
            this.showLoading(true);
            this.brands = [];
            this.filteredBrands = [];
            this.renderBrands();
            this.updateBrandsCount();
        } catch (error) {
            console.error('Error in loadBrands:', error);
            this.showNotification('Error cargando marcas', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadBrandsDetails() {
        // Supabase desactivado
    }

    renderBrands() {
        const gallery = document.getElementById('brandsGallery');
        const empty = document.getElementById('brandsEmpty');
        
        if (this.filteredBrands.length === 0) {
            gallery.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        gallery.style.display = 'grid';
        empty.style.display = 'none';

        const brandsHTML = this.filteredBrands.map(brand => this.createBrandCard(brand)).join('');
        gallery.innerHTML = brandsHTML;
    }

    createBrandCard(brand) {
        const languages = Array.isArray(brand.languages) ? brand.languages.join(', ') : (brand.languages || 'No especificado');
        const createdDate = new Date(brand.created_at).toLocaleDateString();
        
        return `
            <div class="brand-card" data-brand-id="${brand.id}">
                <div class="brand-header">
                    <div class="brand-actions">
                        <button class="brand-action-btn" onclick="openBrandModal('edit', '${brand.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="brand-action-btn" onclick="duplicateBrand('${brand.id}')" title="Duplicar">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="brand-action-btn danger" onclick="deleteBrand('${brand.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    
                    <div class="brand-logo">
                        ${brand.guidelines?.logo_file_id ? 
                            `<img src="/api/files/${brand.guidelines.logo_file_id}" alt="${brand.name} Logo">` :
                            `<div class="brand-logo-placeholder">
                                <i class="fas fa-trademark"></i>
                            </div>`
                        }
                    </div>
                    
                    <h3 class="brand-name">${this.escapeHtml(brand.name)}</h3>
                    ${brand.website ? 
                        `<a href="${brand.website}" target="_blank" class="brand-website">${this.getDomain(brand.website)}</a>` :
                        '<div class="brand-website">Sin sitio web</div>'
                    }
                </div>

                <div class="brand-content">
                    <div class="brand-info">
                        <div class="brand-info-item">
                            <div class="brand-info-value">${brand.productsCount}</div>
                            <div class="brand-info-label">Productos</div>
                        </div>
                        <div class="brand-info-item">
                            <div class="brand-info-value">${brand.filesCount}</div>
                            <div class="brand-info-label">Archivos</div>
                        </div>
                    </div>

                    <div class="brand-description">
                        ${brand.description || 'Sin descripción disponible'}
                    </div>

                    <div class="brand-tags">
                        <span class="brand-tag">${brand.country || 'Sin país'}</span>
                        <span class="brand-tag">${languages}</span>
                    </div>

                    <div class="brand-footer">
                        <div class="brand-stats">
                            <div class="brand-stat">
                                <i class="fas fa-calendar"></i>
                                <span>${createdDate}</span>
                            </div>
                        </div>
                        <button class="brand-manage-btn" onclick="manageBrand('${brand.id}')">
                            Gestionar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('brandsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterBrands(e.target.value);
            });
        }

        // Filter functionality
        const filterSelect = document.getElementById('brandsFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.filterByStatus(e.target.value);
            });
        }

        // Brand form submission
        const brandForm = document.getElementById('brandForm');
        if (brandForm) {
            brandForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveBrand();
            });
        }

        // Close modal on overlay click
        const modalOverlay = document.getElementById('brandModalOverlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeBrandModal();
                }
            });
        }

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeBrandModal();
            }
        });
    }

    filterBrands(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredBrands = this.brands.filter(brand => 
            brand.name.toLowerCase().includes(term) ||
            (brand.website && brand.website.toLowerCase().includes(term)) ||
            (brand.country && brand.country.toLowerCase().includes(term))
        );
        this.renderBrands();
    }

    filterByStatus(status) {
        // For now, just show all brands
        // In the future, you could implement status-based filtering
        this.filteredBrands = [...this.brands];
        this.renderBrands();
    }

    async openBrandModal(mode, brandId = null) {
        this.currentBrandId = brandId;
        
        const modal = document.getElementById('brandModalOverlay');
        const title = document.getElementById('brandModalTitle');
        const subtitle = document.getElementById('brandModalSubtitle');
        const saveBtn = document.getElementById('brandSaveBtn');

        if (mode === 'edit' && brandId) {
            title.textContent = 'Editar Marca y Productos';
            subtitle.textContent = 'Modifica la información de tu marca y gestiona sus productos';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Actualizar Marca';
            
            // Load brand data
            const brand = this.brands.find(b => b.id === brandId);
            if (brand) {
                this.populateForm(brand);
                
                // Load associated products
                if (brand.project_id) {
                    this.brandProducts = await this.loadBrandProducts(brand.project_id);
                    this.renderProductsSection();
                }
            }
        } else {
            title.textContent = 'Nueva Marca';
            subtitle.textContent = 'Configura la información básica de tu marca';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Marca';
            this.clearForm();
            this.hideProductsSection();
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeBrandModal() {
        const modal = document.getElementById('brandModalOverlay');
        modal.classList.remove('active');
        document.body.style.overflow = '';
        this.clearForm();
        this.currentBrandId = null;
    }

    populateForm(brand) {
        document.getElementById('brandName').value = brand.name || '';
        document.getElementById('brandWebsite').value = brand.website || '';
        document.getElementById('brandDescription').value = brand.description || '';
        document.getElementById('brandCountry').value = brand.country || '';
        
        // Handle languages array
        const languagesSelect = document.getElementById('brandLanguages');
        if (brand.languages && Array.isArray(brand.languages)) {
            Array.from(languagesSelect.options).forEach(option => {
                option.selected = brand.languages.includes(option.value);
            });
        }
    }

    clearForm() {
        document.getElementById('brandForm').reset();
        
        // Clear logo preview
        const logoPreview = document.getElementById('logoPreview');
        logoPreview.innerHTML = `
            <div class="logo-placeholder">
                <i class="fas fa-cloud-upload-alt"></i>
                <span>Subir Logo</span>
            </div>
        `;
    }

    async saveBrand() {
        try {
            const saveBtn = document.getElementById('brandSaveBtn');
            this.setButtonLoading(saveBtn, true);

            // Get form data
            const formData = this.getFormData();
            
            // Validate required fields
            if (!formData.name.trim()) {
                this.showNotification('El nombre de la marca es obligatorio', 'error');
                return;
            }

            this.showNotification('Sistema de guardado temporalmente deshabilitado', 'warning');
            this.closeBrandModal();
            await this.loadBrands();

        } catch (error) {
            console.error('Error saving brand:', error);
            this.showNotification('Error guardando marca', 'error');
        } finally {
            const saveBtn = document.getElementById('brandSaveBtn');
            this.setButtonLoading(saveBtn, false);
        }
    }

    getFormData() {
        const languagesSelect = document.getElementById('brandLanguages');
        const selectedLanguages = Array.from(languagesSelect.selectedOptions).map(option => option.value);

        return {
            name: document.getElementById('brandName').value.trim(),
            website: document.getElementById('brandWebsite').value.trim(),
            description: document.getElementById('brandDescription').value.trim(),
            country: document.getElementById('brandCountry').value,
            languages: selectedLanguages
        };
    }

    async deleteBrand(brandId) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta marca? Esta acción no se puede deshacer.')) {
            return;
        }

        this.showNotification('Sistema de eliminación temporalmente deshabilitado', 'warning');
    }

    async duplicateBrand(brandId) {
        try {
            const brand = this.brands.find(b => b.id === brandId);
            if (!brand) return;

            this.showNotification('Sistema de duplicación temporalmente deshabilitado', 'warning');

        } catch (error) {
            console.error('Error duplicating brand:', error);
            this.showNotification('Error duplicando marca', 'error');
        }
    }

    manageBrand(brandId) {
        // Open edit modal with products management
        this.openBrandModal('edit', brandId);
    }

    async loadBrandProducts(projectId) {
        return [];
    }

    renderProductsSection() {
        const modalBody = document.querySelector('.brand-modal-body');
        
        // Check if products section already exists
        let productsSection = document.getElementById('productsSection');
        if (!productsSection) {
            // Create products section
            productsSection = document.createElement('div');
            productsSection.id = 'productsSection';
            productsSection.className = 'form-section';
            productsSection.innerHTML = `
                <h3 class="form-section-title">
                    <i class="fas fa-box"></i>
                    Productos Asociados
                </h3>
                <div class="products-container" id="productsContainer">
                    <!-- Products will be rendered here -->
                </div>
                <div class="products-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.brandsManager.addNewProduct()">
                        <i class="fas fa-plus"></i>
                        Agregar Producto
                    </button>
                </div>
            `;
            
            // Insert after the last form section
            const lastSection = modalBody.querySelector('.form-section:last-child');
            if (lastSection) {
                lastSection.insertAdjacentElement('afterend', productsSection);
            } else {
                modalBody.appendChild(productsSection);
            }
        }

        // Render products
        const productsContainer = document.getElementById('productsContainer');
        if (this.brandProducts && this.brandProducts.length > 0) {
            productsContainer.innerHTML = this.brandProducts.map(product => `
                <div class="product-item" data-product-id="${product.id}">
                    <div class="product-header">
                        <div class="product-info">
                            <h4 class="product-name">${product.name || 'Sin nombre'}</h4>
                            <p class="product-type">${product.product_type || 'Sin tipo'}</p>
                        </div>
                        <div class="product-actions">
                            <button type="button" class="btn btn-sm btn-primary" onclick="window.brandsManager.editProduct('${product.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-danger" onclick="window.brandsManager.deleteProduct('${product.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="product-details">
                        <p class="product-description">${product.short_desc || 'Sin descripción'}</p>
                        <div class="product-meta">
                            <span class="product-price">$${product.price || '0'}</span>
                            <span class="product-variants">${product.variants ? product.variants.length : 0} variantes</span>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            productsContainer.innerHTML = `
                <div class="empty-products">
                    <i class="fas fa-box-open"></i>
                    <p>No hay productos asociados a esta marca</p>
                </div>
            `;
        }
    }

    hideProductsSection() {
        const productsSection = document.getElementById('productsSection');
        if (productsSection) {
            productsSection.style.display = 'none';
        }
    }

    showProductsSection() {
        const productsSection = document.getElementById('productsSection');
        if (productsSection) {
            productsSection.style.display = 'block';
        }
    }

    addNewProduct() {
        // Open product creation modal or redirect to products page
        this.showNotification('Funcionalidad de agregar producto en desarrollo', 'info');
    }

    editProduct(productId) {
        // Open product edit modal
        this.showNotification('Funcionalidad de editar producto en desarrollo', 'info');
    }

    deleteProduct(productId) {
        if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
            this.showNotification('Funcionalidad de eliminar producto en desarrollo', 'info');
        }
    }

    handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            this.showNotification('Por favor selecciona un archivo de imagen válido', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB
            this.showNotification('El archivo es muy grande. Máximo 5MB permitido.', 'error');
            return;
        }

        // Preview image
        const reader = new FileReader();
        reader.onload = (e) => {
            const logoPreview = document.getElementById('logoPreview');
            logoPreview.innerHTML = `<img src="${e.target.result}" alt="Logo Preview">`;
        };
        reader.readAsDataURL(file);
    }

    updateBrandsCount() {
        const countElement = document.getElementById('brandsCount');
        if (countElement) {
            countElement.textContent = this.brands.length;
        }

        // Update navigation count
        if (window.navigationManager) {
            window.navigationManager.updateNavigationCounts();
        }
    }

    showLoading(show) {
        const loading = document.getElementById('brandsLoading');
        const gallery = document.getElementById('brandsGallery');
        
        if (show) {
            loading.style.display = 'grid';
            gallery.style.display = 'none';
        } else {
            loading.style.display = 'none';
            gallery.style.display = 'grid';
        }
    }

    // Utility functions
    async waitForSupabase() {
        // Supabase desactivado
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            button.style.opacity = '0.7';
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            button.dataset.originalText = originalText;
        } else {
            button.disabled = false;
            button.style.opacity = '1';
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    showNotification(message, type = 'info') {
        if (window.navigationManager) {
            window.navigationManager.showNotification('Marcas', message, type);
        } else {
            alert(message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    // Particles removed - no longer used
}

// Global functions for HTML onclick handlers
function openBrandModal(mode, brandId = null) {
    if (window.brandsManager) {
        window.brandsManager.openBrandModal(mode, brandId);
    }
}

function closeBrandModal() {
    if (window.brandsManager) {
        window.brandsManager.closeBrandModal();
    }
}

function deleteBrand(brandId) {
    if (window.brandsManager) {
        window.brandsManager.deleteBrand(brandId);
    }
}

function duplicateBrand(brandId) {
    if (window.brandsManager) {
        window.brandsManager.duplicateBrand(brandId);
    }
}

function manageBrand(brandId) {
    if (window.brandsManager) {
        window.brandsManager.manageBrand(brandId);
    }
}

function handleLogoUpload(event) {
    if (window.brandsManager) {
        window.brandsManager.handleLogoUpload(event);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.brandsManager = new BrandsManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrandsManager;
}
