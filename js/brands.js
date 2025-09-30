/**
 * Brands Manager - UGC Studio
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
        this.createParticles();
    }

    async loadBrands() {
        try {
            this.showLoading(true);
            
            // Wait for Supabase to be ready
            await this.waitForSupabase();
            
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            // Load user's projects (brands)
            const { data: projects, error } = await window.supabaseClient.supabase
                .from('projects')
                .select(`
                    id,
                    name,
                    website,
                    country,
                    languages,
                    created_at,
                    updated_at
                `)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading brands:', error);
                this.showNotification('Error cargando marcas', 'error');
                return;
            }

            this.brands = projects || [];
            this.filteredBrands = [...this.brands];
            
            // Load additional data for each brand
            await this.loadBrandsDetails();
            
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
        // Load additional details for each brand
        for (let brand of this.brands) {
            try {
                // Load products count
                const { count: productsCount } = await window.supabaseClient.supabase
                    .from('products')
                    .select('*', { count: 'exact', head: true })
                    .eq('project_id', brand.id);

                // Load files count
                const { count: filesCount } = await window.supabaseClient.supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('project_id', brand.id);

                // Load brand guidelines
                const { data: guidelines } = await window.supabaseClient.supabase
                    .from('brand_guidelines')
                    .select('*')
                    .eq('project_id', brand.id)
                    .single();

                brand.productsCount = productsCount || 0;
                brand.filesCount = filesCount || 0;
                brand.guidelines = guidelines;

            } catch (error) {
                console.warn(`Error loading details for brand ${brand.id}:`, error);
                brand.productsCount = 0;
                brand.filesCount = 0;
                brand.guidelines = null;
            }
        }
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
            title.textContent = 'Editar Marca';
            subtitle.textContent = 'Modifica la información de tu marca';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Actualizar Marca';
            
            // Load brand data
            const brand = this.brands.find(b => b.id === brandId);
            if (brand) {
                this.populateForm(brand);
            }
        } else {
            title.textContent = 'Nueva Marca';
            subtitle.textContent = 'Configura la información básica de tu marca';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Marca';
            this.clearForm();
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

            await this.waitForSupabase();
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();

            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            if (this.currentBrandId) {
                // Update existing brand
                const { error } = await window.supabaseClient.supabase
                    .from('projects')
                    .update({
                        name: formData.name,
                        website: formData.website,
                        country: formData.country,
                        languages: formData.languages,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentBrandId);

                if (error) {
                    console.error('Error updating brand:', error);
                    this.showNotification('Error actualizando marca', 'error');
                    return;
                }

                this.showNotification('Marca actualizada exitosamente', 'success');
            } else {
                // Create new brand
                const { data, error } = await window.supabaseClient.supabase
                    .from('projects')
                    .insert([{
                        user_id: session.user.id,
                        name: formData.name,
                        website: formData.website,
                        country: formData.country,
                        languages: formData.languages
                    }])
                    .select()
                    .single();

                if (error) {
                    console.error('Error creating brand:', error);
                    this.showNotification('Error creando marca', 'error');
                    return;
                }

                this.showNotification('Marca creada exitosamente', 'success');
            }

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

        try {
            await this.waitForSupabase();

            const { error } = await window.supabaseClient.supabase
                .from('projects')
                .delete()
                .eq('id', brandId);

            if (error) {
                console.error('Error deleting brand:', error);
                this.showNotification('Error eliminando marca', 'error');
                return;
            }

            this.showNotification('Marca eliminada exitosamente', 'success');
            await this.loadBrands();

        } catch (error) {
            console.error('Error deleting brand:', error);
            this.showNotification('Error eliminando marca', 'error');
        }
    }

    async duplicateBrand(brandId) {
        try {
            const brand = this.brands.find(b => b.id === brandId);
            if (!brand) return;

            await this.waitForSupabase();
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();

            const { data, error } = await window.supabaseClient.supabase
                .from('projects')
                .insert([{
                    user_id: session.user.id,
                    name: `${brand.name} (Copia)`,
                    website: brand.website,
                    country: brand.country,
                    languages: brand.languages
                }])
                .select()
                .single();

            if (error) {
                console.error('Error duplicating brand:', error);
                this.showNotification('Error duplicando marca', 'error');
                return;
            }

            this.showNotification('Marca duplicada exitosamente', 'success');
            await this.loadBrands();

        } catch (error) {
            console.error('Error duplicating brand:', error);
            this.showNotification('Error duplicando marca', 'error');
        }
    }

    manageBrand(brandId) {
        // For now, just open edit modal
        this.openBrandModal('edit', brandId);
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
        let attempts = 0;
        while ((!window.supabaseClient || !window.supabaseClient.isReady()) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!window.supabaseClient || !window.supabaseClient.isReady()) {
            throw new Error('Supabase not available');
        }
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

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;

        const particleCount = 20;

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
