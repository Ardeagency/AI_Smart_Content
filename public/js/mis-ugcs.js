// ===== MIS UGCs - JAVASCRIPT =====

// Configuración global
const MisUGCs = {
    // Estado de la aplicación
    state: {
        currentTab: 'recientes',
        searchQuery: '',
        filterType: 'all',
        filterDate: 'all',
        viewMode: 'grid', // grid o list
        selectedUGCs: [],
        ugcData: []
    },

    // Inicialización
    init() {
        this.bindEvents();
        this.loadUGCData();
        this.initializeView();
    },

    // Event listeners
    bindEvents() {
        // Navegación de pestañas
        document.querySelectorAll('.ugcs-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.closest('.ugcs-tab').dataset.tab);
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
        document.querySelectorAll('.filter-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.handleFilter(e.target);
            });
        });

        // Botón de filtros
        const filterBtn = document.querySelector('.btn-secondary');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.toggleAdvancedFilters();
            });
        }

        // Acciones de UGC
        document.querySelectorAll('.btn-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleUGCAction(e.target);
            });
        });

        // Botón de play
        document.querySelectorAll('.btn-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.playUGC(e.target.closest('.ugc-card'));
            });
        });

        // Paginación
        document.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handlePagination(e.target);
            });
        });

        // Cambiar vista
        this.addViewToggle();
    },

    // Cambiar pestaña
    switchTab(tabName) {
        // Actualizar pestañas
        document.querySelectorAll('.ugcs-tab').forEach(tab => {
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
        this.loadTabContent(tabName);
    },

    // Cargar contenido de pestaña
    loadTabContent(tabName) {
        switch(tabName) {
            case 'recientes':
                this.loadRecentUGCs();
                break;
            case 'favoritos':
                this.loadFavoriteUGCs();
                break;
            case 'por-producto':
                this.loadUGCsByProduct();
                break;
            case 'por-fecha':
                this.loadUGCsByDate();
                break;
        }
    },

    // Cargar UGCs recientes
    loadRecentUGCs() {
        console.log('Cargando UGCs recientes...');
        this.animateUGCs();
    },

    // Cargar UGCs favoritos
    loadFavoriteUGCs() {
        console.log('Cargando UGCs favoritos...');
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'block';
        }
    },

    // Cargar UGCs por producto
    loadUGCsByProduct() {
        console.log('Cargando UGCs por producto...');
        // Implementar lógica de filtrado por producto
    },

    // Cargar UGCs por fecha
    loadUGCsByDate() {
        console.log('Cargando UGCs por fecha...');
        // Implementar lógica de filtrado por fecha
    },

    // Manejar búsqueda
    handleSearch(query) {
        this.state.searchQuery = query.toLowerCase();
        this.filterUGCs();
    },

    // Manejar filtros
    handleFilter(selectElement) {
        const filterType = selectElement.name || 'type';
        const value = selectElement.value;
        
        if (filterType === 'type') {
            this.state.filterType = value;
        } else if (filterType === 'date') {
            this.state.filterDate = value;
        }
        
        this.filterUGCs();
    },

    // Filtrar UGCs
    filterUGCs() {
        const ugcCards = document.querySelectorAll('.ugc-card');
        
        ugcCards.forEach(card => {
            const title = card.querySelector('.ugc-title').textContent.toLowerCase();
            const type = card.querySelector('.ugc-type').textContent.toLowerCase();
            const date = card.querySelector('.ugc-date').textContent.toLowerCase();
            
            const matchesSearch = this.state.searchQuery === '' || 
                title.includes(this.state.searchQuery);
            
            const matchesType = this.state.filterType === 'all' || 
                type.includes(this.state.filterType);
            
            const matchesDate = this.state.filterDate === 'all' || 
                this.matchesDateFilter(date, this.state.filterDate);
            
            if (matchesSearch && matchesType && matchesDate) {
                card.style.display = 'block';
                card.classList.add('fade-in');
            } else {
                card.style.display = 'none';
            }
        });
    },

    // Verificar coincidencia de fecha
    matchesDateFilter(dateString, filter) {
        // Implementar lógica de filtrado por fecha
        return true;
    },

    // Toggle filtros avanzados
    toggleAdvancedFilters() {
        console.log('Mostrando filtros avanzados...');
        // Implementar modal de filtros avanzados
    },

    // Manejar acciones de UGC
    handleUGCAction(button) {
        const action = button.closest('.btn-action');
        const card = action.closest('.ugc-card');
        const actionType = action.title || action.querySelector('i').className;
        
        if (actionType.includes('heart') || actionType.includes('fa-heart')) {
            this.toggleFavorite(card);
        } else if (actionType.includes('download') || actionType.includes('fa-download')) {
            this.downloadUGC(card);
        } else if (actionType.includes('share') || actionType.includes('fa-share')) {
            this.shareUGC(card);
        }
    },

    // Toggle favorito
    toggleFavorite(card) {
        const heartIcon = card.querySelector('.fa-heart');
        const isFavorite = heartIcon.classList.contains('favorited');
        
        if (isFavorite) {
            heartIcon.classList.remove('favorited');
            heartIcon.style.color = '';
        } else {
            heartIcon.classList.add('favorited');
            heartIcon.style.color = '#ef4444';
        }
        
        // Actualizar contador de favoritos
        this.updateFavoritesCount();
    },

    // Actualizar contador de favoritos
    updateFavoritesCount() {
        const favoritesTab = document.querySelector('[data-tab="favoritos"] .tab-count');
        if (favoritesTab) {
            const favoriteCount = document.querySelectorAll('.fa-heart.favorited').length;
            favoritesTab.textContent = favoriteCount;
        }
    },

    // Descargar UGC
    downloadUGC(card) {
        const title = card.querySelector('.ugc-title').textContent;
        console.log(`Descargando UGC: ${title}`);
        
        // Simular descarga
        const downloadBtn = card.querySelector('.fa-download').closest('.btn-action');
        downloadBtn.style.color = '#22c55e';
        setTimeout(() => {
            downloadBtn.style.color = '';
        }, 2000);
    },

    // Compartir UGC
    shareUGC(card) {
        const title = card.querySelector('.ugc-title').textContent;
        console.log(`Compartiendo UGC: ${title}`);
        
        // Implementar lógica de compartir
        if (navigator.share) {
            navigator.share({
                title: title,
                text: 'Mira este UGC generado con UGC STUDIO',
                url: window.location.href
            });
        } else {
            // Fallback para navegadores que no soportan Web Share API
            this.showShareModal(card);
        }
    },

    // Mostrar modal de compartir
    showShareModal(card) {
        console.log('Mostrando modal de compartir...');
        // Implementar modal de compartir
    },

    // Reproducir UGC
    playUGC(card) {
        const title = card.querySelector('.ugc-title').textContent;
        console.log(`Reproduciendo UGC: ${title}`);
        
        // Simular reproducción
        const playBtn = card.querySelector('.btn-play');
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        
        setTimeout(() => {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        }, 3000);
    },

    // Manejar paginación
    handlePagination(button) {
        if (button.classList.contains('disabled')) return;
        
        const page = button.textContent;
        console.log(`Navegando a página ${page}`);
        
        // Actualizar botones de paginación
        document.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Cargar contenido de la página
        this.loadPage(parseInt(page));
    },

    // Cargar página
    loadPage(page) {
        console.log(`Cargando página ${page}...`);
        // Implementar lógica de paginación
    },

    // Agregar toggle de vista
    addViewToggle() {
        const controls = document.querySelector('.ugcs-controls');
        if (controls) {
            const viewToggle = document.createElement('div');
            viewToggle.className = 'view-toggle';
            viewToggle.innerHTML = `
                <button class="view-btn ${this.state.viewMode === 'grid' ? 'active' : ''}" data-view="grid">
                    <i class="fas fa-th"></i>
                </button>
                <button class="view-btn ${this.state.viewMode === 'list' ? 'active' : ''}" data-view="list">
                    <i class="fas fa-list"></i>
                </button>
            `;
            
            controls.appendChild(viewToggle);
            
            // Event listeners para toggle de vista
            viewToggle.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.toggleView(e.target.dataset.view);
                });
            });
        }
    },

    // Toggle vista
    toggleView(viewMode) {
        this.state.viewMode = viewMode;
        
        // Actualizar botones
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${viewMode}"]`).classList.add('active');
        
        // Actualizar grid
        const ugcGrid = document.querySelector('.ugc-grid');
        if (ugcGrid) {
            ugcGrid.className = `ugc-${viewMode}`;
        }
    },

    // Animar UGCs
    animateUGCs() {
        const ugcCards = document.querySelectorAll('.ugc-card');
        ugcCards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            card.classList.add('fade-in');
        });
    },

    // Cargar datos de UGCs
    loadUGCData() {
        console.log('Cargando datos de UGCs...');
        // Simular carga de datos
        setTimeout(() => {
            this.animateUGCs();
        }, 100);
    },

    // Inicializar vista
    initializeView() {
        this.loadTabContent(this.state.currentTab);
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    MisUGCs.init();
});

// Animaciones CSS adicionales
const style = document.createElement('style');
style.textContent = `
    .ugc-card {
        transition: all 0.3s ease;
    }
    
    .ugc-card.fade-in {
        animation: fadeInUp 0.5s ease-out;
    }
    
    .btn-action {
        transition: all 0.3s ease;
    }
    
    .btn-action:hover {
        transform: scale(1.1);
    }
    
    .fa-heart.favorited {
        color: #ef4444 !important;
        animation: heartBeat 0.6s ease-in-out;
    }
    
    .view-toggle {
        display: flex;
        gap: var(--spacing-xs);
        margin-left: var(--spacing-md);
    }
    
    .view-btn {
        background: transparent;
        border: 1px solid var(--color-medium-gray);
        color: var(--color-light-gray);
        padding: 8px 12px;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .view-btn.active {
        background: var(--color-secondary);
        border-color: var(--color-secondary);
        color: var(--color-white);
    }
    
    .view-btn:hover {
        border-color: var(--color-secondary);
        color: var(--color-secondary);
    }
    
    .ugc-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }
    
    .ugc-list .ugc-card {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
    }
    
    .ugc-list .ugc-preview {
        width: 120px;
        height: 80px;
        flex-shrink: 0;
    }
    
    .ugc-list .ugc-info {
        flex: 1;
    }
    
    @keyframes heartBeat {
        0% { transform: scale(1); }
        14% { transform: scale(1.3); }
        28% { transform: scale(1); }
        42% { transform: scale(1.3); }
        70% { transform: scale(1); }
    }
`;
document.head.appendChild(style);
