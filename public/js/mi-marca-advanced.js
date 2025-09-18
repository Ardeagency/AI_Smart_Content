// ===== PÁGINA DE EDICIÓN DE MARCA =====

class BrandEditor {
    constructor() {
        this.currentBrand = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadBrandData();
    }

    bindEvents() {
        document.addEventListener("click", (e) => {
            if (e.target.textContent === "Subir Logo") {
                this.uploadLogo();
            } else if (e.target.textContent === "Editar") {
                this.editColors();
            } else if (e.target.textContent === "Configurar") {
                this.editTone();
            } else if (e.target.textContent === "Definir") {
                this.editTargetAudience();
            }
        });
    }

    async loadBrandData() {
        try {
            const authData = JSON.parse(localStorage.getItem("ugc_studio_auth") || "{}");
            if (!authData.user) {
                this.showNotification("Debes iniciar sesión para ver tus marcas", "error");
                return;
            }

            const result = await window.supabaseAPI.getBrandsByUser(authData.user.id);
            
            if (result.success && result.data.length > 0) {
                this.currentBrand = result.data[0];
                this.populateBrandData();
            } else {
                this.showNotification("No tienes marcas configuradas. Ve a configurar tu marca.", "info");
            }
        } catch (error) {
            console.error("Error al cargar datos de marca:", error);
            this.showNotification("Error al cargar los datos de la marca", "error");
        }
    }

    populateBrandData() {
        if (!this.currentBrand) return;

        if (this.currentBrand.eslogan) {
            document.getElementById("brand-slogan").textContent = this.currentBrand.eslogan;
        }
        
        if (this.currentBrand.identidad_proposito) {
            document.getElementById("brand-description").textContent = this.currentBrand.identidad_proposito;
        }
        
        if (this.currentBrand.publico_objetivo) {
            document.getElementById("target-audience").textContent = this.currentBrand.publico_objetivo;
        }
    }

    uploadLogo() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => this.handleLogoUpload(e);
        input.click();
    }

    async handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.showNotification("Logo subido exitosamente", "success");
            
            const logoPreview = document.querySelector(".logo-preview");
            logoPreview.innerHTML = `
                <img src="${URL.createObjectURL(file)}" alt="Logo" style="max-width: 100px; max-height: 100px; object-fit: contain;">
            `;
        } catch (error) {
            this.showNotification("Error al subir el logo", "error");
        }
    }

    editColors() {
        this.showNotification("Funcionalidad de edición de colores en desarrollo", "info");
    }

    editTone() {
        this.showNotification("Funcionalidad de edición de tono en desarrollo", "info");
    }

    editTargetAudience() {
        this.showNotification("Funcionalidad de edición de público objetivo en desarrollo", "info");
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

// Funciones globales
function uploadLogo() {
    if (window.brandEditor) {
        window.brandEditor.uploadLogo();
    }
}

function editColors() {
    if (window.brandEditor) {
        window.brandEditor.editColors();
    }
}

function editSlogan() {
    if (window.brandEditor) {
        window.brandEditor.editSlogan();
    }
}

function editDescription() {
    if (window.brandEditor) {
        window.brandEditor.editDescription();
    }
}

function editTone() {
    if (window.brandEditor) {
        window.brandEditor.editTone();
    }
}

function editTargetAudience() {
    if (window.brandEditor) {
        window.brandEditor.editTargetAudience();
    }
}

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
    window.brandEditor = new BrandEditor();
});
