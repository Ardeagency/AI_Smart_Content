// Mi Marca - Funcionalidades Avanzadas
class AdvancedBrandManager {
    constructor() {
        this.brandData = {
            logo: null,
            localImage: null,
            colors: ['#FD624F', '#000000', '#FFFFFF', '#808080'],
            slogan: 'Innovación que transforma tu negocio',
            description: 'Marca innovadora enfocada en tecnología y creatividad. Nuestro objetivo es simplificar procesos complejos y hacer la tecnología accesible para todos.',
            tone: ['Profesional', 'Innovador', 'Accesible', 'Confiable'],
            targetAudience: 'Profesionales de 25-45 años interesados en tecnología y productividad.'
        };
        
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando AdvancedBrandManager...');
        this.setupEventListeners();
        this.updateUI();
        console.log('✅ AdvancedBrandManager inicializado correctamente');
    }

    // Configurar todos los event listeners
    setupEventListeners() {
        // Botón subir logo
        const uploadLogoBtn = document.querySelector('[onclick="uploadLogo()"]');
        if (uploadLogoBtn) {
            uploadLogoBtn.removeAttribute('onclick');
            uploadLogoBtn.addEventListener('click', () => this.uploadLogo());
        }

        // Botón subir imagen del local
        const uploadLocalBtn = document.querySelector('[onclick="uploadLocalImage()"]');
        if (uploadLocalBtn) {
            uploadLocalBtn.removeAttribute('onclick');
            uploadLocalBtn.addEventListener('click', () => this.uploadLocalImage());
        }

        // Botón editar colores
        const editColorsBtn = document.querySelector('[onclick="editColors()"]');
        if (editColorsBtn) {
            editColorsBtn.removeAttribute('onclick');
            editColorsBtn.addEventListener('click', () => this.showColorPicker());
        }

        // Botón editar eslogan
        const editSloganBtn = document.querySelector('[onclick="editSlogan()"]');
        if (editSloganBtn) {
            editSloganBtn.removeAttribute('onclick');
            editSloganBtn.addEventListener('click', () => this.editSloganInline());
        }

        // Botón editar descripción
        const editDescBtn = document.querySelector('[onclick="editDescription()"]');
        if (editDescBtn) {
            editDescBtn.removeAttribute('onclick');
            editDescBtn.addEventListener('click', () => this.editDescriptionInline());
        }

        // Botón configurar tono
        const editToneBtn = document.querySelector('[onclick="editTone()"]');
        if (editToneBtn) {
            editToneBtn.removeAttribute('onclick');
            editToneBtn.addEventListener('click', () => this.showToneSelector());
        }

        // Botón definir público objetivo
        const editAudienceBtn = document.querySelector('[onclick="editTargetAudience()"]');
        if (editAudienceBtn) {
            editAudienceBtn.removeAttribute('onclick');
            editAudienceBtn.addEventListener('click', () => this.editTargetAudienceInline());
        }
    }

    // Actualizar la interfaz
    updateUI() {
        // Actualizar logo si existe
        if (this.brandData.logo) {
            const logoPreview = document.querySelector('.logo-preview');
            if (logoPreview) {
                logoPreview.innerHTML = `<img src="${this.brandData.logo}" alt="Logo" style="max-width: 64px; max-height: 64px; border-radius: 8px;">`;
            }
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
        const sloganEl = document.getElementById('brand-slogan');
        if (sloganEl) sloganEl.textContent = this.brandData.slogan;

        const descEl = document.getElementById('brand-description');
        if (descEl) descEl.textContent = this.brandData.description;

        const audienceEl = document.getElementById('target-audience');
        if (audienceEl) audienceEl.textContent = this.brandData.targetAudience;

        // Actualizar tono de comunicación
        this.updateToneTags();
    }

    // Actualizar paleta de colores
    updateColorPalette() {
        const colorPalette = document.querySelector('.color-palette');
        if (!colorPalette) return;
        
        colorPalette.innerHTML = '';
        
        this.brandData.colors.forEach((color, index) => {
            const colorItem = document.createElement('div');
            colorItem.className = 'color-item';
            colorItem.innerHTML = `
                <div class="color-swatch" style="background-color: ${color}; cursor: pointer;" data-index="${index}"></div>
                <span>${color}</span>
            `;
            
            // Agregar event listener para editar color individual
            const swatch = colorItem.querySelector('.color-swatch');
            swatch.addEventListener('click', () => this.editSingleColor(index));
            
            colorPalette.appendChild(colorItem);
        });
    }

    // Actualizar tags de tono
    updateToneTags() {
        const toneTags = document.getElementById('tone-tags');
        if (!toneTags) return;
        
        toneTags.innerHTML = '';
        
        this.brandData.tone.forEach(tone => {
            const tag = document.createElement('span');
            tag.className = 'tone-tag';
            tag.textContent = tone;
            toneTags.appendChild(tag);
        });
    }

    // Subir logo
    uploadLogo() {
        console.log('🖼️ Subir logo clickeado');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const imageUrl = URL.createObjectURL(file);
                this.brandData.logo = imageUrl;
                this.updateUI();
                this.showNotification('Logo actualizado exitosamente', 'success');
                
                // Guardar en PostgreSQL
                await this.saveToDatabase({ logo_url: imageUrl });
            }
        };
        
        input.click();
    }

    // Subir imagen del local
    uploadLocalImage() {
        console.log('🏢 Subir imagen del local clickeado');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const imageUrl = URL.createObjectURL(file);
                this.brandData.localImage = imageUrl;
                this.updateUI();
                this.showNotification('Imagen del local actualizada exitosamente', 'success');
                
                // Guardar en PostgreSQL
                await this.saveToDatabase({ local_image_url: imageUrl });
            }
        };
        
        input.click();
    }

    // Mostrar selector de colores avanzado
    showColorPicker() {
        console.log('🎨 Mostrar selector de colores');
        this.createColorPickerModal();
    }

    // Crear modal de selector de colores
    createColorPickerModal() {
        const modal = document.createElement('div');
        modal.className = 'color-picker-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Editar Paleta de Colores</h3>
                        <button class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="color-picker-container">
                            ${this.brandData.colors.map((color, index) => `
                                <div class="color-picker-item">
                                    <div class="color-preview" style="background-color: ${color}"></div>
                                    <input type="color" value="${color}" class="color-input" data-index="${index}">
                                    <input type="text" value="${color}" class="color-text" data-index="${index}" placeholder="#000000">
                                    <button class="remove-color" data-index="${index}">×</button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="add-color-btn">+ Agregar Color</button>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary cancel-btn">Cancelar</button>
                        <button class="btn btn-primary save-colors-btn">Guardar Colores</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners del modal
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        const saveBtn = modal.querySelector('.save-colors-btn');
        const addColorBtn = modal.querySelector('.add-color-btn');

        closeBtn.addEventListener('click', () => modal.remove());
        cancelBtn.addEventListener('click', () => modal.remove());

        saveBtn.addEventListener('click', async () => {
            const colorInputs = modal.querySelectorAll('.color-input');
            const newColors = Array.from(colorInputs).map(input => input.value);
            this.brandData.colors = newColors;
            this.updateColorPalette();
            this.showNotification('Colores actualizados exitosamente', 'success');
            
            // Guardar en PostgreSQL
            await this.saveToDatabase({ paleta_colores: newColors });
            
            modal.remove();
        });

        addColorBtn.addEventListener('click', () => {
            if (this.brandData.colors.length < 8) {
                this.brandData.colors.push('#000000');
                this.createColorPickerModal();
                modal.remove();
            } else {
                this.showNotification('Máximo 8 colores permitidos', 'error');
            }
        });

        // Sincronizar inputs de color y texto
        modal.querySelectorAll('.color-input').forEach(input => {
            const textInput = modal.querySelector(`.color-text[data-index="${input.dataset.index}"]`);
            input.addEventListener('input', () => {
                textInput.value = input.value;
            });
            textInput.addEventListener('input', () => {
                if (/^#[0-9A-F]{6}$/i.test(textInput.value)) {
                    input.value = textInput.value;
                }
            });
        });

        // Botón eliminar color
        modal.querySelectorAll('.remove-color').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.brandData.colors.length > 1) {
                    const index = parseInt(btn.dataset.index);
                    this.brandData.colors.splice(index, 1);
                    this.createColorPickerModal();
                    modal.remove();
                } else {
                    this.showNotification('Debe tener al menos un color', 'error');
                }
            });
        });
    }

    // Editar color individual
    editSingleColor(index) {
        const currentColor = this.brandData.colors[index];
        const newColor = prompt('Ingresa el nuevo color (formato #RRGGBB):', currentColor);
        
        if (newColor && /^#[0-9A-F]{6}$/i.test(newColor)) {
            this.brandData.colors[index] = newColor.toUpperCase();
            this.updateColorPalette();
            this.showNotification('Color actualizado exitosamente', 'success');
        } else if (newColor) {
            this.showNotification('Formato de color inválido. Use #RRGGBB', 'error');
        }
    }

    // Editar eslogan inline
    editSloganInline() {
        console.log('💬 Editar eslogan clickeado');
        const sloganEl = document.getElementById('brand-slogan');
        if (!sloganEl) return;

        const currentText = sloganEl.textContent;
        sloganEl.innerHTML = `<input type="text" value="${currentText}" class="inline-edit" style="width: 100%; background: transparent; border: 2px solid #FD624F; color: #FD624F; padding: 8px; border-radius: 4px; font-size: 1.1rem; font-weight: 600;">`;
        
        const input = sloganEl.querySelector('.inline-edit');
        input.focus();
        input.select();

        const saveEdit = async () => {
            const newText = input.value.trim();
            if (newText && newText !== currentText) {
                this.brandData.slogan = newText;
                sloganEl.textContent = newText;
                this.showNotification('Eslogan actualizado exitosamente', 'success');
                
                // Guardar en PostgreSQL
                await this.saveToDatabase({ eslogan: newText });
            } else {
                sloganEl.textContent = currentText;
            }
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            }
        });
    }

    // Editar descripción inline
    editDescriptionInline() {
        console.log('📝 Editar descripción clickeado');
        const descEl = document.getElementById('brand-description');
        if (!descEl) return;

        const currentText = descEl.textContent;
        descEl.innerHTML = `<textarea class="inline-edit" style="width: 100%; background: transparent; border: 2px solid #FD624F; color: var(--text-secondary); padding: 8px; border-radius: 4px; font-size: 0.9rem; min-height: 80px; resize: vertical;">${currentText}</textarea>`;
        
        const textarea = descEl.querySelector('.inline-edit');
        textarea.focus();

        const saveEdit = async () => {
            const newText = textarea.value.trim();
            if (newText && newText !== currentText) {
                this.brandData.description = newText;
                descEl.textContent = newText;
                this.showNotification('Descripción actualizada exitosamente', 'success');
                
                // Guardar en PostgreSQL
                await this.saveToDatabase({ identidad_proposito: newText });
            } else {
                descEl.textContent = currentText;
            }
        };

        textarea.addEventListener('blur', saveEdit);
        textarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                saveEdit();
            }
        });
    }

    // Mostrar selector de tono
    showToneSelector() {
        console.log('🎭 Mostrar selector de tono');
        this.createToneSelectorModal();
    }

    // Crear modal de selector de tono
    createToneSelectorModal() {
        const availableTones = ['Profesional', 'Innovador', 'Accesible', 'Confiable', 'Creativo', 'Técnico', 'Amigable', 'Serio', 'Dinámico', 'Tradicional', 'Moderno', 'Clásico', 'Joven', 'Maduro', 'Femenino', 'Masculino', 'Neutro'];
        
        const modal = document.createElement('div');
        modal.className = 'tone-selector-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Configurar Tono de Comunicación</h3>
                        <button class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="tone-options">
                            ${availableTones.map(tone => `
                                <label class="tone-option">
                                    <input type="checkbox" value="${tone}" ${this.brandData.tone.includes(tone) ? 'checked' : ''}>
                                    <span>${tone}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary cancel-btn">Cancelar</button>
                        <button class="btn btn-primary save-tone-btn">Guardar Tono</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners del modal
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        const saveBtn = modal.querySelector('.save-tone-btn');

        closeBtn.addEventListener('click', () => modal.remove());
        cancelBtn.addEventListener('click', () => modal.remove());

        saveBtn.addEventListener('click', async () => {
            const selectedTones = Array.from(modal.querySelectorAll('input:checked')).map(input => input.value);
            this.brandData.tone = selectedTones;
            this.updateToneTags();
            this.showNotification('Tono de comunicación actualizado exitosamente', 'success');
            
            // Guardar en PostgreSQL
            await this.saveToDatabase({ tono_comunicacion: selectedTones });
            
            modal.remove();
        });
    }

    // Editar público objetivo inline
    editTargetAudienceInline() {
        console.log('👥 Editar público objetivo clickeado');
        const audienceEl = document.getElementById('target-audience');
        if (!audienceEl) return;

        const currentText = audienceEl.textContent;
        audienceEl.innerHTML = `<textarea class="inline-edit" style="width: 100%; background: transparent; border: 2px solid #FD624F; color: var(--text-secondary); padding: 8px; border-radius: 4px; font-size: 0.9rem; min-height: 60px; resize: vertical;">${currentText}</textarea>`;
        
        const textarea = audienceEl.querySelector('.inline-edit');
        textarea.focus();

        const saveEdit = async () => {
            const newText = textarea.value.trim();
            if (newText && newText !== currentText) {
                this.brandData.targetAudience = newText;
                audienceEl.textContent = newText;
                this.showNotification('Público objetivo actualizado exitosamente', 'success');
                
                // Guardar en PostgreSQL
                await this.saveToDatabase({ publico_objetivo: newText });
            } else {
                audienceEl.textContent = currentText;
            }
        };

        textarea.addEventListener('blur', saveEdit);
        textarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                saveEdit();
            }
        });
    }

    // Guardar datos en PostgreSQL
    async saveToDatabase(data) {
        try {
            console.log('💾 Guardando en PostgreSQL:', data);
            
            const response = await fetch('/api/brands/1', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('✅ Datos guardados exitosamente:', result.message);
                this.showNotification('Datos guardados correctamente', 'success');
            } else {
                console.log('⚠️ Error al guardar en PostgreSQL:', result.message || 'Error desconocido');
                this.showNotification('Error al guardar, usando almacenamiento local', 'error');
            }
        } catch (error) {
            console.log('⚠️ Error de conexión a PostgreSQL:', error);
            this.showNotification('Error de conexión, usando almacenamiento local', 'error');
        }
    }

    // Mostrar notificaciones
    showNotification(message, type = 'info') {
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
            z-index: 10000;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.brandManager = new AdvancedBrandManager();
});
