// ===== PÁGINA DE EDICIÓN DE PRODUCTOS =====

class ProductEditor {
    constructor() {
        this.products = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadProducts();
    }

    bindEvents() {
        // Botón de agregar producto
        const addBtn = document.querySelector(".btn-primary");
        if (addBtn) {
            addBtn.addEventListener("click", () => this.addProduct());
        }

        // Búsqueda
        const searchInput = document.querySelector(".search-input");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => this.searchProducts(e.target.value));
        }

        // Filtros
        const filterSelects = document.querySelectorAll(".filter-select select");
        filterSelects.forEach(select => {
            select.addEventListener("change", (e) => this.filterProducts());
        });
    }

    async loadProducts() {
        try {
            const authData = JSON.parse(localStorage.getItem("ugc_studio_auth") || "{}");
            if (!authData.user) {
                this.showNotification("Debes iniciar sesión para ver tus productos", "error");
                return;
            }

            const result = await window.supabaseAPI.getProductsByUser(authData.user.id);
            
            if (result.success) {
                this.products = result.data;
                this.renderProducts();
            } else {
                this.showNotification("Error al cargar productos", "error");
            }
        } catch (error) {
            console.error("Error al cargar productos:", error);
            this.showNotification("Error al cargar los productos", "error");
        }
    }

    renderProducts() {
        const productsGrid = document.querySelector(".products-grid");
        if (!productsGrid) return;

        if (this.products.length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <path d="M16 10a4 4 0 0 1-8 0"></path>
                        </svg>
                    </div>
                    <h3>No tienes productos</h3>
                    <p>Agrega tu primer producto para comenzar a crear contenido UGC</p>
                    <button class="btn btn-primary" onclick="productEditor.addProduct()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Agregar Producto</span>
                    </button>
                </div>
            `;
            return;
        }

        productsGrid.innerHTML = this.products.map(product => `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image">
                    ${this.renderProductImage(product)}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.nombre_producto}</h3>
                    <p class="product-category">${product.categoria}</p>
                    <p class="product-description">${product.descripcion}</p>
                    <div class="product-actions">
                        <button class="btn btn-secondary" onclick="productEditor.editProduct(${product.id})">Editar</button>
                        <button class="btn btn-ghost" onclick="productEditor.useInUGC(${product.id})">Usar en UGC</button>
                    </div>
                </div>
            </div>
        `).join("");
    }

    renderProductImage(product) {
        if (product.imagenes_producto && product.imagenes_producto.length > 0) {
            return `<img src="${product.imagenes_producto[0]}" alt="${product.nombre_producto}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px;">`;
        }
        
        return `
            <div class="image-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
            </div>
        `;
    }

    addProduct() {
        window.location.href = "datos-productos.html";
    }

    editProduct(productId) {
        // Por ahora, redirigir al formulario de productos
        window.location.href = "datos-productos.html";
    }

    useInUGC(productId) {
        this.showNotification("Funcionalidad de UGC en desarrollo", "info");
    }

    searchProducts(query) {
        const filteredProducts = this.products.filter(product => 
            product.nombre_producto.toLowerCase().includes(query.toLowerCase()) ||
            product.descripcion.toLowerCase().includes(query.toLowerCase()) ||
            product.categoria.toLowerCase().includes(query.toLowerCase())
        );
        
        this.renderFilteredProducts(filteredProducts);
    }

    filterProducts() {
        // Implementar filtros por tipo y orden
        this.renderProducts();
    }

    renderFilteredProducts(products) {
        const productsGrid = document.querySelector(".products-grid");
        if (!productsGrid) return;

        productsGrid.innerHTML = products.map(product => `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image">
                    ${this.renderProductImage(product)}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.nombre_producto}</h3>
                    <p class="product-category">${product.categoria}</p>
                    <p class="product-description">${product.descripcion}</p>
                    <div class="product-actions">
                        <button class="btn btn-secondary" onclick="productEditor.editProduct(${product.id})">Editar</button>
                        <button class="btn btn-ghost" onclick="productEditor.useInUGC(${product.id})">Usar en UGC</button>
                    </div>
                </div>
            </div>
        `).join("");
    }

    showNotification(message, type = "info") {
        const notification = document.createElement("div");
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>
            <span>${message}</span>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#3b82f6"};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 4000);
    }
}

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
    window.productEditor = new ProductEditor();
});
