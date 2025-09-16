// UGC Studio - Main JavaScript
class UGCStudio {
    constructor() {
        this.state = {
            currentUser: {
                name: "Olivia Rhye",
                plan: "Pro"
            },
            selectedStyle: null,
            searchQuery: '',
            currentCategory: 'Categoría',
            currentSort: 'Ordenar por'
        };
        
        this.init();
    }

    init() {
        this.initializeNavigation();
        this.initializeSearch();
        this.initializeFilters();
        this.initializeStyleCards();
        this.initializeButtons();
        
        console.log("🚀 UGC Studio inicializado");
    }

    // Navegación del sidebar
    initializeNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remover clase active de todos los enlaces
                navLinks.forEach(l => l.classList.remove('active'));
                
                // Agregar clase active al enlace clickeado
                link.classList.add('active');
                
                // Obtener el texto del enlace para determinar la acción
                const linkText = link.querySelector('.nav-text').textContent;
                this.handleNavigation(linkText);
            });
        });
    }

    // Manejar navegación
    handleNavigation(section) {
        switch(section) {
            case 'Inicio':
                window.location.href = 'index.html';
                break;
            case 'Studio':
                window.location.href = 'studio.html';
                break;
            case 'Biblioteca':
                window.location.href = 'biblioteca.html';
                break;
            case 'Mis Productos':
                window.location.href = 'mis-productos.html';
                break;
            case 'Mi Marca':
                window.location.href = 'mi-marca.html';
                break;
            case 'Mis Avatares':
                window.location.href = 'mis-avatares.html';
                break;
            default:
                this.showNotification(`Navegando a ${section}...`, 'info');
        }
    }

    // Búsqueda
    initializeSearch() {
        const searchInput = document.querySelector('.search-input');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                this.state.searchQuery = query;
                this.filterStyles();
            });
        }
    }

    // Filtros
    initializeFilters() {
        const categorySelect = document.querySelector('.filter-wrapper select:first-child');
        const sortSelect = document.querySelector('.filter-wrapper select:last-child');
        
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                this.state.currentCategory = e.target.value;
                this.filterStyles();
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.state.currentSort = e.target.value;
                this.sortStyles();
            });
        }
    }

    // Tarjetas de estilos
    initializeStyleCards() {
        const styleCards = document.querySelectorAll('.style-card');
        
        styleCards.forEach(card => {
            card.addEventListener('click', () => {
                // Remover selección anterior
                styleCards.forEach(c => c.classList.remove('selected'));
                
                // Seleccionar nueva tarjeta
                card.classList.add('selected');
                
                // Actualizar estado
                const styleName = card.querySelector('.style-name').textContent;
                this.state.selectedStyle = styleName;
                
                this.showNotification(`Estilo seleccionado: ${styleName}`, 'success');
            });

            // Navegación por teclado
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });
    }

    // Botones
    initializeButtons() {
        const createButton = document.querySelector('.btn-primary');
        const useStyleButtons = document.querySelectorAll('.btn-secondary');
        
        if (createButton) {
            createButton.addEventListener('click', () => {
                this.handleCreateContent();
            });
        }
        
        useStyleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const styleCard = btn.closest('.style-card');
                const styleName = styleCard.querySelector('.style-name').textContent;
                this.handleUseStyle(styleName);
            });
        });
    }

    // Filtrar estilos
    filterStyles() {
        const styleCards = document.querySelectorAll('.style-card');
        const query = this.state.searchQuery;
        const category = this.state.currentCategory;
        
        styleCards.forEach(card => {
            const styleName = card.querySelector('.style-name').textContent.toLowerCase();
            const cardElement = card;
            
            let shouldShow = true;
            
            // Filtrar por búsqueda
            if (query && !styleName.includes(query)) {
                shouldShow = false;
            }
            
            // Filtrar por categoría (simulado)
            if (category !== 'Categoría') {
                // Aquí podrías agregar lógica de categorías real
                // Por ahora solo mostramos todos
            }
            
            cardElement.style.display = shouldShow ? 'block' : 'none';
        });
    }

    // Ordenar estilos
    sortStyles() {
        const styleGrid = document.querySelector('.style-grid');
        const styleCards = Array.from(document.querySelectorAll('.style-card'));
        const sortBy = this.state.currentSort;
        
        if (sortBy === 'Populares') {
            // Ordenar por popularidad (simulado)
            styleCards.sort((a, b) => {
                const nameA = a.querySelector('.style-name').textContent;
                const nameB = b.querySelector('.style-name').textContent;
                return nameA.localeCompare(nameB);
            });
        } else if (sortBy === 'Recientes') {
            // Ordenar por recientes (simulado)
            styleCards.sort((a, b) => {
                const nameA = a.querySelector('.style-name').textContent;
                const nameB = b.querySelector('.style-name').textContent;
                return nameB.localeCompare(nameA);
            });
        }
        
        // Reorganizar el grid
        styleCards.forEach(card => {
            styleGrid.appendChild(card);
        });
    }

    // Manejar creación de contenido
    handleCreateContent() {
        if (this.state.selectedStyle) {
            this.showNotification(`Creando contenido con estilo: ${this.state.selectedStyle}`, 'info');
            // Aquí podrías redirigir a la página de creación
        } else {
            this.showNotification('Por favor, selecciona un estilo primero', 'warning');
        }
    }

    // Manejar uso de estilo
    handleUseStyle(styleName) {
        this.state.selectedStyle = styleName;
        
        // Actualizar selección visual
        const styleCards = document.querySelectorAll('.style-card');
        styleCards.forEach(card => {
            card.classList.remove('selected');
            if (card.querySelector('.style-name').textContent === styleName) {
                card.classList.add('selected');
            }
        });
        
        this.showNotification(`Usando estilo: ${styleName}`, 'success');
    }

    // Mostrar notificación
    showNotification(message, type = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#FF9800' : type === 'error' ? '#F44336' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        // Remover después de 3 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Obtener estilos disponibles
    getAvailableStyles() {
        return [
            { name: 'Cinematográfico', category: 'Profesional', popular: true },
            { name: 'E-commerce', category: 'Comercial', popular: true },
            { name: 'Creativo', category: 'Arte', popular: false },
            { name: 'Comida', category: 'Lifestyle', popular: true }
        ];
    }

    // Obtener estadísticas del usuario
    getUserStats() {
        return {
            totalStyles: 4,
            selectedStyle: this.state.selectedStyle,
            lastUsed: 'Hace 2 horas'
        };
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new UGCStudio();
});

// Agregar estilos de animación para notificaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification {
        font-family: 'Inter', sans-serif;
        font-size: 0.9rem;
    }
`;
document.head.appendChild(style);

// Pestañas de biblioteca
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remover clase active de todos los botones
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // Agregar clase active al botón clickeado
            button.classList.add('active');
            
            // Obtener el tipo de tab
            const tabType = button.getAttribute('data-tab');
            filterLibraryItems(tabType);
        });
    });
}

// Filtrar elementos de biblioteca
function filterLibraryItems(tabType) {
    const libraryItems = document.querySelectorAll('.library-item');
    
    libraryItems.forEach(item => {
        if (tabType === 'todos') {
            item.style.display = '';
        } else {
            // Aquí podrías implementar lógica de filtrado más específica
            // Por ahora mostramos todos los elementos
            item.style.display = '';
        }
    });
    
    console.log(`📢 INFO: Mostrando: ${tabType}`);
}

// Inicializar pestañas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
});