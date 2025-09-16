// ===== BIBLIOTECA - JAVASCRIPT =====

// Configuración global
const Biblioteca = {
    // Estado de la aplicación
    state: {
        currentTab: 'marcas',
        searchQuery: '',
        filterCategory: 'all',
        selectedItems: []
    },

    // Inicialización
    init() {
        this.bindEvents();
        this.loadLibraryData();
    },

    // Event listeners
    bindEvents() {
        // Navegación de pestañas
        document.querySelectorAll('.library-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Búsqueda
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // Filtros
        const filterSelect = document.querySelector('.filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.handleFilter(e.target.value);
            });
        }

        // Botones de acción en tarjetas
        document.querySelectorAll('.btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCardAction(e.target);
            });
        });

        // Selección de tarjetas
        document.querySelectorAll('.library-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-icon')) {
                    this.toggleCardSelection(card);
                }
            });
        });
    },

    // Cambiar pestaña
    switchTab(tabName) {
        // Actualizar pestañas
        document.querySelectorAll('.library-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Actualizar contenido
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Actualizar estado
        this.state.currentTab = tabName;
    },

    // Manejar búsqueda
    handleSearch(query) {
        this.state.searchQuery = query.toLowerCase();
        this.filterContent();
    },

    // Manejar filtros
    handleFilter(category) {
        this.state.filterCategory = category;
        this.filterContent();
    },

    // Filtrar contenido
    filterContent() {
        const cards = document.querySelectorAll('.library-card:not(.add-card)');
        
        cards.forEach(card => {
            const title = card.querySelector('.card-title, .product-title, .avatar-name').textContent.toLowerCase();
            const description = card.querySelector('.card-subtitle, .product-description, .avatar-role')?.textContent.toLowerCase() || '';
            const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());
            
            const matchesSearch = this.state.searchQuery === '' || 
                title.includes(this.state.searchQuery) || 
                description.includes(this.state.searchQuery) ||
                tags.some(tag => tag.includes(this.state.searchQuery));
            
            const matchesFilter = this.state.filterCategory === 'all' || 
                this.getCardCategory(card) === this.state.filterCategory;
            
            if (matchesSearch && matchesFilter) {
                card.style.display = 'block';
                card.classList.add('fade-in');
            } else {
                card.style.display = 'none';
            }
        });
    },

    // Obtener categoría de tarjeta
    getCardCategory(card) {
        if (card.classList.contains('brand-card')) return 'brands';
        if (card.classList.contains('product-card')) return 'products';
        if (card.classList.contains('avatar-card')) return 'avatars';
        if (card.classList.contains('resource-card')) return 'resources';
        return 'all';
    },

    // Toggle selección de tarjeta
    toggleCardSelection(card) {
        card.classList.toggle('selected');
        
        if (card.classList.contains('selected')) {
            this.state.selectedItems.push(card);
        } else {
            const index = this.state.selectedItems.indexOf(card);
            if (index > -1) {
                this.state.selectedItems.splice(index, 1);
            }
        }
        
        this.updateSelectionUI();
    },

    // Actualizar UI de selección
    updateSelectionUI() {
        const selectedCount = this.state.selectedItems.length;
        
        // Mostrar/ocultar barra de acciones
        let actionBar = document.querySelector('.selection-action-bar');
        if (!actionBar && selectedCount > 0) {
            this.createActionBar();
        } else if (actionBar && selectedCount === 0) {
            actionBar.remove();
        }
        
        if (actionBar) {
            const countElement = actionBar.querySelector('.selected-count');
            if (countElement) {
                countElement.textContent = `${selectedCount} seleccionados`;
            }
        }
    },

    // Crear barra de acciones
    createActionBar() {
        const actionBar = document.createElement('div');
        actionBar.className = 'selection-action-bar';
        actionBar.innerHTML = `
            <div class="action-bar-content">
                <span class="selected-count">${this.state.selectedItems.length} seleccionados</span>
                <div class="action-buttons">
                    <button class="btn-secondary btn-bulk-edit">
                        <i class="fas fa-edit"></i>
                        Editar
                    </button>
                    <button class="btn-secondary btn-bulk-delete">
                        <i class="fas fa-trash"></i>
                        Eliminar
                    </button>
                    <button class="btn-ghost btn-clear-selection">
                        <i class="fas fa-times"></i>
                        Cancelar
                    </button>
                </div>
            </div>
        `;
        
        document.querySelector('.library-content').insertBefore(actionBar, document.querySelector('.tab-content'));
        
        // Event listeners para acciones
        actionBar.querySelector('.btn-bulk-edit').addEventListener('click', () => this.bulkEdit());
        actionBar.querySelector('.btn-bulk-delete').addEventListener('click', () => this.bulkDelete());
        actionBar.querySelector('.btn-clear-selection').addEventListener('click', () => this.clearSelection());
    },

    // Edición masiva
    bulkEdit() {
        console.log('Edición masiva de', this.state.selectedItems.length, 'elementos');
        // Implementar lógica de edición masiva
    },

    // Eliminación masiva
    bulkDelete() {
        if (confirm(`¿Estás seguro de que quieres eliminar ${this.state.selectedItems.length} elementos?`)) {
            this.state.selectedItems.forEach(card => {
                card.remove();
            });
            this.clearSelection();
        }
    },

    // Limpiar selección
    clearSelection() {
        this.state.selectedItems.forEach(card => {
            card.classList.remove('selected');
        });
        this.state.selectedItems = [];
        this.updateSelectionUI();
    },

    // Manejar acciones de tarjeta
    handleCardAction(button) {
        const action = button.closest('.btn-icon');
        const card = action.closest('.library-card');
        const actionType = action.title || action.querySelector('i').className;
        
        if (actionType.includes('edit') || actionType.includes('fa-edit')) {
            this.editCard(card);
        } else if (actionType.includes('delete') || actionType.includes('fa-trash')) {
            this.deleteCard(card);
        } else if (actionType.includes('copy') || actionType.includes('fa-copy')) {
            this.copyCard(card);
        }
    },

    // Editar tarjeta
    editCard(card) {
        console.log('Editando tarjeta:', card);
        // Implementar modal de edición
    },

    // Eliminar tarjeta
    deleteCard(card) {
        if (confirm('¿Estás seguro de que quieres eliminar este elemento?')) {
            card.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                card.remove();
            }, 300);
        }
    },

    // Copiar tarjeta
    copyCard(card) {
        console.log('Copiando tarjeta:', card);
        // Implementar lógica de copia
    },

    // Cargar datos de biblioteca
    loadLibraryData() {
        // Simular carga de datos
        console.log('Cargando datos de biblioteca...');
        
        // Aplicar animaciones de entrada
        setTimeout(() => {
            document.querySelectorAll('.library-card').forEach((card, index) => {
                card.style.animationDelay = `${index * 0.1}s`;
                card.classList.add('fade-in');
            });
        }, 100);
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    Biblioteca.init();
});

// Funciones globales para modales
function openAddModal(type) {
    console.log(`Abriendo modal para agregar ${type}`);
    // Implementar modal de agregar elemento
}

// Animaciones CSS adicionales
const style = document.createElement('style');
style.textContent = `
    .library-card {
        transition: all 0.3s ease;
    }
    
    .library-card.fade-in {
        animation: fadeInUp 0.5s ease-out;
    }
    
    .library-card.selected {
        border-color: var(--color-secondary);
        background: rgba(253, 98, 79, 0.1);
    }
    
    .selection-action-bar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-dark-gray);
        border: 1px solid var(--color-secondary);
        border-radius: var(--border-radius-lg);
        padding: var(--spacing-md);
        z-index: 1000;
        animation: slideInUp 0.3s ease-out;
    }
    
    .action-bar-content {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
    }
    
    .selected-count {
        color: var(--color-white);
        font-weight: var(--font-weight-medium);
    }
    
    .action-buttons {
        display: flex;
        gap: var(--spacing-sm);
    }
    
    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.95);
        }
    }
`;
document.head.appendChild(style);
