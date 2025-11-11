/**
 * Library Manager - AI Smart Content
 * Maneja la biblioteca de archivos del usuario
 */

class LibraryManager {
    constructor() {
        this.files = [];
        this.filteredFiles = [];
        this.currentFolder = 'all';
        this.currentView = 'grid';
        this.isLoading = false;
        this.init();
    }

    async init() {
        await this.loadFiles();
        this.setupEventListeners();
        this.createParticles();
        this.renderFiles();
    }

    async loadFiles() {
        try {
            this.showLoading(true);
            
            // Wait for Supabase to be ready
            await this.waitForSupabase();
            
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            // Load user's files
            const { data: files, error } = await window.supabaseClient.supabase
                .from('files')
                .select(`
                    id,
                    name,
                    file_type,
                    file_size,
                    file_url,
                    category,
                    tags,
                    project_id,
                    created_at,
                    updated_at
                `)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading files:', error);
                this.files = [];
                this.filteredFiles = [];
                return;
            }

            this.files = files || [];
            this.filteredFiles = [...this.files];
            
            this.updateFolderCounts();
            
        } catch (error) {
            console.error('Error in loadFiles:', error);
            this.files = [];
            this.filteredFiles = [];
        } finally {
            this.showLoading(false);
        }
    }



    renderFiles() {
        const gallery = document.getElementById('filesGallery');
        const empty = document.getElementById('libraryEmpty');
        
        if (this.filteredFiles.length === 0) {
            gallery.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        
        const filesHTML = this.filteredFiles.map(file => this.createFileCard(file)).join('');
        gallery.innerHTML = filesHTML;
        gallery.className = `files-gallery ${this.currentView}-view`;
    }

    createFileCard(file) {
        const fileSize = this.formatFileSize(file.file_size);
        const createdDate = new Date(file.created_at).toLocaleDateString();
        const tagsHTML = file.tags ? file.tags.map(tag => `<span class="file-tag">#${tag}</span>`).join('') : '';
        const fileExtension = file.name.split('.').pop().toUpperCase();

        return `
            <div class="file-card" data-file-id="${file.id}" data-category="${file.category}">
                <div class="file-preview">
                    ${file.file_type === 'image' && file.file_url ? 
                        `<img src="${file.file_url}" alt="${file.name}" class="file-image">` :
                        `<div class="file-placeholder">
                            <i class="fas ${this.getFileIcon(file.file_type)}"></i>
                            <span class="file-type-label">${fileExtension}</span>
                        </div>`
                    }
                    
                    <div class="file-overlay">
                        <div class="file-actions">
                            <button class="file-action-btn" onclick="previewFile('${file.id}')" title="Vista previa">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="file-action-btn" onclick="downloadFile('${file.id}')" title="Descargar">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="file-action-btn" onclick="shareFile('${file.id}')" title="Compartir">
                                <i class="fas fa-share-alt"></i>
                            </button>
                            <button class="file-action-btn danger" onclick="deleteFile('${file.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="file-content">
                    <div class="file-header">
                        <div>
                            <h3 class="file-name">${this.escapeHtml(file.name)}</h3>
                            <div class="file-date">${createdDate}</div>
                        </div>
                        <div class="file-size">${fileSize}</div>
                    </div>

                    <div class="file-details">
                        <div class="file-detail-item">
                            <span class="file-detail-label">Tipo:</span>
                            <span class="file-detail-value">${this.getFileTypeLabel(file.file_type)}</span>
                        </div>
                        <div class="file-detail-item">
                            <span class="file-detail-label">Categoría:</span>
                            <span class="file-detail-value">${this.getCategoryLabel(file.category)}</span>
                        </div>
                    </div>

                    ${tagsHTML ? `<div class="file-tags">${tagsHTML}</div>` : ''}

                    <div class="file-footer">
                        <div class="file-type-badge">${fileExtension}</div>
                        <div class="file-actions-list">
                            <button class="file-action-list-btn" onclick="editFile('${file.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="file-action-list-btn" onclick="moveFile('${file.id}')" title="Mover">
                                <i class="fas fa-folder-open"></i>
                            </button>
                            <button class="file-action-list-btn danger" onclick="deleteFile('${file.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('librarySearch');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.filterFiles(e.target.value);
                }, 300);
            });
        }

        // Type filter
        const typeFilter = document.getElementById('typeFilter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.filterByType(e.target.value);
            });
        }

        // Date filter
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => {
                this.filterByDate(e.target.value);
            });
        }

        // Folder navigation
        const folderLinks = document.querySelectorAll('.folder-link');
        folderLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const folder = link.dataset.folder;
                this.selectFolder(folder);
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
    }

    filterFiles(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredFiles = this.files.filter(file => 
            file.name.toLowerCase().includes(term) ||
            (file.tags && file.tags.some(tag => tag.toLowerCase().includes(term))) ||
            file.category.toLowerCase().includes(term)
        );
        
        this.renderFiles();
    }

    filterByType(type) {
        if (type === 'all') {
            this.filteredFiles = this.getFilesByFolder(this.currentFolder);
        } else {
            const folderFiles = this.getFilesByFolder(this.currentFolder);
            this.filteredFiles = folderFiles.filter(file => file.file_type === type);
        }
        
        this.renderFiles();
    }

    filterByDate(period) {
        const now = new Date();
        let startDate;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                this.filteredFiles = this.getFilesByFolder(this.currentFolder);
                this.renderFiles();
                return;
        }

        const folderFiles = this.getFilesByFolder(this.currentFolder);
        this.filteredFiles = folderFiles.filter(file => 
            new Date(file.created_at) >= startDate
        );
        
        this.renderFiles();
    }

    selectFolder(folder) {
        this.currentFolder = folder;
        
        // Update active state
        document.querySelectorAll('.folder-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-folder="${folder}"]`).classList.add('active');
        
        // Update breadcrumbs
        this.updateBreadcrumbs(folder);
        
        // Filter files by folder
        this.filteredFiles = this.getFilesByFolder(folder);
        this.renderFiles();
    }

    getFilesByFolder(folder) {
        if (folder === 'all') {
            return [...this.files];
        }
        return this.files.filter(file => file.category === folder);
    }

    updateBreadcrumbs(folder) {
        const folderNames = {
            'all': 'Todos los archivos',
            'avatars': 'Avatares',
            'ugcs': 'UGCs Creados',
            'styles': 'Estilos Guardados',
            'templates': 'Plantillas',
            'uploads': 'Subidas'
        };

        const currentFolderName = document.getElementById('currentFolderName');
        if (currentFolderName) {
            currentFolderName.textContent = folderNames[folder] || folder;
        }
    }

    changeView(view) {
        this.currentView = view;
        
        // Update active state
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        this.renderFiles();
    }

    updateFolderCounts() {
        const counts = {
            all: this.files.length,
            avatars: this.files.filter(f => f.category === 'avatars').length,
            ugcs: this.files.filter(f => f.category === 'ugcs').length,
            styles: this.files.filter(f => f.category === 'styles').length,
            templates: this.files.filter(f => f.category === 'templates').length,
            uploads: this.files.filter(f => f.category === 'uploads').length
        };

        Object.keys(counts).forEach(folder => {
            const countElement = document.getElementById(`${folder}${folder === 'all' ? 'Files' : ''}Count`);
            if (countElement) {
                countElement.textContent = counts[folder];
            }
        });

        // Update library count in navigation
        const libraryCount = document.getElementById('libraryCount');
        if (libraryCount) {
            libraryCount.textContent = this.files.length;
        }
    }

    // File action handlers
    previewFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.showNotification('Vista Previa', `Mostrando vista previa de: ${file.name}`, 'info');
        // Here you would implement preview functionality
    }

    downloadFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.showNotification('Descarga', `Descargando: ${file.name}`, 'success');
        // Here you would implement download functionality
    }

    shareFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.showNotification('Compartir', `Generando enlace para: ${file.name}`, 'info');
        // Here you would implement share functionality
    }

    editFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.showNotification('Editor', `Abriendo editor para: ${file.name}`, 'info');
        // Here you would implement edit functionality
    }

    moveFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.showNotification('Mover Archivo', `Selecciona destino para: ${file.name}`, 'info');
        // Here you would implement move functionality
    }

    async deleteFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        if (!confirm(`¿Estás seguro de que quieres eliminar "${file.name}"? Esta acción no se puede deshacer.`)) {
            return;
        }

        try {
            // Here you would implement actual file deletion
            this.showNotification('Archivo Eliminado', `${file.name} ha sido eliminado`, 'success');
            
            // Remove from local array
            this.files = this.files.filter(f => f.id !== fileId);
            this.filteredFiles = this.filteredFiles.filter(f => f.id !== fileId);
            
            this.updateFolderCounts();
            this.renderFiles();

        } catch (error) {
            console.error('Error deleting file:', error);
            this.showNotification('Error', 'No se pudo eliminar el archivo', 'error');
        }
    }

    createFolder() {
        const folderName = prompt('Nombre de la nueva carpeta:');
        if (!folderName) return;

        this.showNotification('Nueva Carpeta', `Carpeta "${folderName}" creada`, 'success');
        // Here you would implement folder creation
    }

    // Utility functions
    getFileIcon(fileType) {
        const icons = {
            'image': 'fa-image',
            'video': 'fa-video',
            'audio': 'fa-music',
            'document': 'fa-file-alt'
        };
        return icons[fileType] || 'fa-file';
    }

    getFileTypeLabel(fileType) {
        const labels = {
            'image': 'Imagen',
            'video': 'Video',
            'audio': 'Audio',
            'document': 'Documento'
        };
        return labels[fileType] || fileType;
    }

    getCategoryLabel(category) {
        const labels = {
            'avatars': 'Avatares',
            'ugcs': 'UGCs',
            'styles': 'Estilos',
            'templates': 'Plantillas',
            'uploads': 'Subidas'
        };
        return labels[category] || category;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showLoading(show) {
        const loading = document.getElementById('libraryLoading');
        const gallery = document.getElementById('filesGallery');
        
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
                <div class="loading-file-card">
                    <div class="loading-file-preview"></div>
                    <div class="loading-file-content">
                        <div class="loading-file-name"></div>
                        <div class="loading-file-date"></div>
                        <div class="loading-file-details">
                            <div class="loading-file-detail"></div>
                            <div class="loading-file-detail"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        return loadingHTML;
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
function previewFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.previewFile(fileId);
    }
}

function downloadFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.downloadFile(fileId);
    }
}

function shareFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.shareFile(fileId);
    }
}

function editFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.editFile(fileId);
    }
}

function moveFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.moveFile(fileId);
    }
}

function deleteFile(fileId) {
    if (window.libraryManager) {
        window.libraryManager.deleteFile(fileId);
    }
}

function createFolder() {
    if (window.libraryManager) {
        window.libraryManager.createFolder();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.libraryManager = new LibraryManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LibraryManager;
}
