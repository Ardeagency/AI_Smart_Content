// Mi Marca - Funcionalidades específicas
class BrandManager {
    constructor() {
        this.brandData = {
            logo: null,
            colors: ['#FD624F', '#000000', '#FFFFFF', '#808080'],
            slogan: 'Innovación que transforma tu negocio',
            description: 'Marca innovadora enfocada en tecnología y creatividad. Nuestro objetivo es simplificar procesos complejos y hacer la tecnología accesible para todos.',
            tone: ['Profesional', 'Innovador', 'Accesible', 'Confiable'],
            targetAudience: 'Profesionales de 25-45 años interesados en tecnología y productividad.'
        };
        
        this.init();
    }

    async init() {
        await this.loadBrandData();
        this.setupEventListeners();
    }

    // Cargar datos de la marca desde PostgreSQL
    async loadBrandData() {
        try {
            const response = await fetch('/api/brands/1'); // Asumiendo que el usuario tiene ID 1
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    const brand = result.data;
                    this.brandData = {
                        logo: brand.logo_url,
                        localImage: brand.local_image_url,
                        colors: brand.paleta_colores || this.brandData.colors,
                        slogan: brand.slogan || this.brandData.slogan,
                        description: brand.identidad_proposito || this.brandData.description,
                        tone: brand.tono_comunicacion || this.brandData.tone,
                        targetAudience: brand.publico_objetivo || this.brandData.targetAudience
                    };
                    this.updateUI();
                } else {
                    // Si no existe la marca, usar datos ficticios
                    this.useFictitiousData();
                }
            } else {
                // Si no existe la marca, usar datos ficticios
                this.useFictitiousData();
            }
        } catch (error) {
            console.log('Error cargando datos de marca, usando datos ficticios:', error);
            this.useFictitiousData();
        }
    }

    // Usar datos ficticios cuando no hay base de datos
    useFictitiousData() {
        console.log('Usando datos ficticios para visualización');
        this.updateUI();
    }

    // Crear marca ficticia si no existe
    async createFictitiousBrand() {
        try {
            const fictitiousBrand = {
                user_id: 1,
                nombre_marca: 'TechFlow Solutions',
                nicho_principal: 'Tecnología',
                sub_nicho: 'Software Empresarial',
                categorias_asociadas: ['B2B', 'SaaS', 'Enterprise'],
                publico_objetivo: this.brandData.targetAudience,
                mercado_sector: 'Empresarial',
                logo_url: null,
                local_image_url: null,
                slogan: this.brandData.slogan,
                paleta_colores: this.brandData.colors,
                tipografias_oficiales: ['Inter', 'Helvetica'],
                identidad_proposito: this.brandData.description,
                personalidad_marca: this.brandData.tone,
                tono_comunicacion: this.brandData.tone,
                storytelling_filosofia: 'Transformamos ideas en soluciones tecnológicas innovadoras que impulsan el crecimiento empresarial.',
                archivos_adicionales: [],
                activo: true
            };

            const response = await fetch('/api/brands', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(fictitiousBrand)
            });

            if (response.ok) {
                console.log('Marca ficticia creada exitosamente');
            }
        } catch (error) {
            console.log('Error creando marca ficticia:', error);
        }
    }

    // Actualizar la interfaz con los datos cargados
    updateUI() {
        // Actualizar logo si existe
        if (this.brandData.logo) {
            const logoPreview = document.querySelector('.logo-preview');
            logoPreview.innerHTML = `<img src="${this.brandData.logo}" alt="Logo" style="max-width: 64px; max-height: 64px;">`;
        }

        // Actualizar imagen del local si existe
        if (this.brandData.localImage) {
            const localPreview = document.querySelector('.local-preview');
            if (localPreview) {
                localPreview.innerHTML = `<img src="${this.brandData.localImage}" alt="Local Comercial" style="max-width: 100%; max-height: 120px; object-fit: cover; border-radius: 8px;">`;
            }
        }

        // Actualizar colores
        this.updateColorPalette();

        // Actualizar texto
        document.getElementById('brand-slogan').textContent = this.brandData.slogan;
        document.getElementById('brand-description').textContent = this.brandData.description;
        document.getElementById('target-audience').textContent = this.brandData.targetAudience;

        // Actualizar tono de comunicación
        this.updateToneTags();
    }

    // Actualizar paleta de colores
    updateColorPalette() {
        const colorPalette = document.querySelector('.color-palette');
        colorPalette.innerHTML = '';
        
        this.brandData.colors.forEach(color => {
            const colorItem = document.createElement('div');
            colorItem.className = 'color-item';
            colorItem.innerHTML = `
                <div class="color-swatch" style="background-color: ${color};"></div>
                <span>${color}</span>
            `;
            colorPalette.appendChild(colorItem);
        });
    }

    // Actualizar tags de tono
    updateToneTags() {
        const toneTags = document.getElementById('tone-tags');
        toneTags.innerHTML = '';
        
        this.brandData.tone.forEach(tone => {
            const tag = document.createElement('span');
            tag.className = 'tone-tag';
            tag.textContent = tone;
            toneTags.appendChild(tag);
        });
    }

    // Configurar event listeners
    setupEventListeners() {
        // Event listeners para edición inline
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-ghost')) {
                e.preventDefault();
            }
        });
    }

    // Función para subir logo
    async uploadLogo() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                // Crear URL local para la imagen
                const imageUrl = URL.createObjectURL(file);
                this.brandData.logo = imageUrl;
                this.updateUI();
                this.showNotification('Logo actualizado exitosamente', 'success');
                
                // Intentar guardar en base de datos si está disponible
                try {
                    const formData = new FormData();
                    formData.append('logo', file);
                    
                    const response = await fetch('/api/brands/1/logo', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        this.brandData.logo = result.logo_url;
                        this.updateUI();
                    }
                } catch (error) {
                    console.log('Base de datos no disponible, usando almacenamiento local');
                }
            }
        };
        
        input.click();
    }

    // Función para subir imagen del local comercial
    async uploadLocalImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                // Crear URL local para la imagen
                const imageUrl = URL.createObjectURL(file);
                this.brandData.localImage = imageUrl;
                this.updateUI();
                this.showNotification('Imagen del local actualizada exitosamente', 'success');
                
                // Intentar guardar en base de datos si está disponible
                try {
                    const formData = new FormData();
                    formData.append('local_image', file);
                    
                    const response = await fetch('/api/brands/1/local-image', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        this.brandData.localImage = result.local_image_url;
                        this.updateUI();
                    }
                } catch (error) {
                    console.log('Base de datos no disponible, usando almacenamiento local');
                }
            }
        };
        
        input.click();
    }

    // Función para editar colores
    async editColors() {
        const newColors = prompt('Ingresa los colores separados por comas (ej: #FD624F, #000000, #FFFFFF):', 
                                this.brandData.colors.join(', '));
        
        if (newColors) {
            const colors = newColors.split(',').map(color => color.trim());
            this.brandData.colors = colors;
            this.updateColorPalette();
            this.showNotification('Colores actualizados exitosamente', 'success');
            
            // Intentar guardar en base de datos si está disponible
            try {
                const response = await fetch('/api/brands/1', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        paleta_colores: colors
                    })
                });
                
                if (response.ok) {
                    console.log('Colores guardados en base de datos');
                }
            } catch (error) {
                console.log('Base de datos no disponible, usando almacenamiento local');
            }
        }
    }

    // Función para editar eslogan
    async editSlogan() {
        const newSlogan = prompt('Ingresa el nuevo eslogan:', this.brandData.slogan);
        
        if (newSlogan && newSlogan !== this.brandData.slogan) {
            this.brandData.slogan = newSlogan;
            document.getElementById('brand-slogan').textContent = newSlogan;
            this.showNotification('Eslogan actualizado exitosamente', 'success');
            
            // Intentar guardar en base de datos si está disponible
            try {
                const response = await fetch('/api/brands/1', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        slogan: newSlogan
                    })
                });
                
                if (response.ok) {
                    console.log('Eslogan guardado en base de datos');
                }
            } catch (error) {
                console.log('Base de datos no disponible, usando almacenamiento local');
            }
        }
    }

    // Función para editar descripción
    async editDescription() {
        const newDescription = prompt('Ingresa la nueva descripción:', this.brandData.description);
        
        if (newDescription && newDescription !== this.brandData.description) {
            this.brandData.description = newDescription;
            document.getElementById('brand-description').textContent = newDescription;
            this.showNotification('Descripción actualizada exitosamente', 'success');
            
            // Intentar guardar en base de datos si está disponible
            try {
                const response = await fetch('/api/brands/1', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identidad_proposito: newDescription
                    })
                });
                
                if (response.ok) {
                    console.log('Descripción guardada en base de datos');
                }
            } catch (error) {
                console.log('Base de datos no disponible, usando almacenamiento local');
            }
        }
    }

    // Función para editar tono de comunicación
    async editTone() {
        const availableTones = ['Profesional', 'Innovador', 'Accesible', 'Confiable', 'Creativo', 'Técnico', 'Amigable', 'Serio', 'Dinámico', 'Tradicional'];
        const currentTones = this.brandData.tone.join(', ');
        const newTones = prompt(`Ingresa los tonos separados por comas:\n\nOpciones disponibles: ${availableTones.join(', ')}\n\nTono actual: ${currentTones}`, currentTones);
        
        if (newTones) {
            const tones = newTones.split(',').map(tone => tone.trim());
            this.brandData.tone = tones;
            this.updateToneTags();
            this.showNotification('Tono de comunicación actualizado exitosamente', 'success');
            
            // Intentar guardar en base de datos si está disponible
            try {
                const response = await fetch('/api/brands/1', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        tono_comunicacion: tones
                    })
                });
                
                if (response.ok) {
                    console.log('Tono guardado en base de datos');
                }
            } catch (error) {
                console.log('Base de datos no disponible, usando almacenamiento local');
            }
        }
    }

    // Función para editar público objetivo
    async editTargetAudience() {
        const newTargetAudience = prompt('Ingresa el nuevo público objetivo:', this.brandData.targetAudience);
        
        if (newTargetAudience && newTargetAudience !== this.brandData.targetAudience) {
            this.brandData.targetAudience = newTargetAudience;
            document.getElementById('target-audience').textContent = newTargetAudience;
            this.showNotification('Público objetivo actualizado exitosamente', 'success');
            
            // Intentar guardar en base de datos si está disponible
            try {
                const response = await fetch('/api/brands/1', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        publico_objetivo: newTargetAudience
                    })
                });
                
                if (response.ok) {
                    console.log('Público objetivo guardado en base de datos');
                }
            } catch (error) {
                console.log('Base de datos no disponible, usando almacenamiento local');
            }
        }
    }

    // Mostrar notificaciones
    showNotification(message, type = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 1000;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        // Remover después de 3 segundos
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Funciones globales para los botones
let brandManager;

function uploadLogo() {
    console.log('🖼️ Subir logo clickeado');
    brandManager.uploadLogo();
}

function uploadLocalImage() {
    console.log('🏢 Subir imagen del local clickeado');
    brandManager.uploadLocalImage();
}

function editColors() {
    console.log('🎨 Editar colores clickeado');
    brandManager.editColors();
}

function editSlogan() {
    console.log('💬 Editar eslogan clickeado');
    brandManager.editSlogan();
}

function editDescription() {
    console.log('📝 Editar descripción clickeado');
    brandManager.editDescription();
}

function editTone() {
    console.log('🎭 Editar tono clickeado');
    brandManager.editTone();
}

function editTargetAudience() {
    console.log('👥 Editar público objetivo clickeado');
    brandManager.editTargetAudience();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando BrandManager...');
    brandManager = new BrandManager();
    console.log('✅ BrandManager inicializado correctamente');
});
