/**
 * Canvas Manager - Sistema de Canvas Interactivo para UGC Studio
 * Maneja zoom, pan, objetos y animaciones del canvas
 */

class CanvasManager {
    constructor() {
        // Configuración del canvas
        this.canvas = {
            element: null,
            contentWrapper: null,
            zoom: 1,
            minZoom: 0.2,
            maxZoom: 2.5,
            panX: 0,
            panY: 0,
            isDragging: false,
            dragStart: { x: 0, y: 0 },
            isGenerating: false,
            objects: [],
            loadingCards: [],
            baseSize: 2000
        };

        // Configuración de animaciones
        this.animations = {
            loadingDuration: 2000, // 2 segundos de animación de carga
            cardAppearDelay: 300,   // Delay entre aparición de cards
            shimmerSpeed: 1.5       // Velocidad del efecto shimmer
        };

        this.init();
    }

    /* =======================================
       INICIALIZACIÓN
       ======================================= */

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupStyles();
        this.debugCanvas();
        console.log('✅ Canvas Manager inicializado');
    }

    setupCanvas() {
        this.canvas.element = document.querySelector('.canvas-area');
        if (!this.canvas.element) {
            console.error('❌ Canvas element not found');
            return;
        }
        
        // Crear el content wrapper si no existe
        this.createContentWrapper();
    }

    createContentWrapper() {
        // Verificar si ya existe
        this.canvas.contentWrapper = document.getElementById('canvas-content-wrapper');
        
        if (!this.canvas.contentWrapper) {
            // Crear el wrapper
            this.canvas.contentWrapper = document.createElement('div');
            this.canvas.contentWrapper.id = 'canvas-content-wrapper';
            this.canvas.element.appendChild(this.canvas.contentWrapper);
        }
    }

    setupEventListeners() {
        if (!this.canvas.element) return;

        // OPTIMIZACIÓN: Throttle para eventos de zoom
        let lastWheelTime = 0;
        this.canvas.element.addEventListener('wheel', (e) => {
            const now = Date.now();
            if (now - lastWheelTime < 16) return; // ~60fps throttle
            lastWheelTime = now;
            
            e.preventDefault();
            this.handleZoom(e);
        });

        // Pan con mouse
        this.canvas.element.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });

        // OPTIMIZACIÓN: Throttle para mousemove
        let mouseMoveThrottle = false;
        document.addEventListener('mousemove', (e) => {
            if (mouseMoveThrottle) return;
            mouseMoveThrottle = true;
            requestAnimationFrame(() => {
                this.handleMouseMove(e);
                mouseMoveThrottle = false;
            });
        });

        document.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });

        // Touch events para móviles
        this.canvas.element.addEventListener('touchstart', (e) => {
            this.handleTouchStart(e);
        }, { passive: false });

        let touchMoveThrottle = false;
        this.canvas.element.addEventListener('touchmove', (e) => {
            if (touchMoveThrottle) return;
            touchMoveThrottle = true;
            requestAnimationFrame(() => {
                e.preventDefault();
                this.handleTouchMove(e);
                touchMoveThrottle = false;
            });
        }, { passive: false });

        this.canvas.element.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e);
        });
    }

    setupStyles() {
        if (!this.canvas.element || !this.canvas.contentWrapper) return;

        // Canvas area (viewport fijo) - NO aplicar estilos inline, usar CSS
        this.canvas.element.style.overflow = 'hidden';
        this.canvas.element.style.cursor = 'grab';
        this.canvas.element.style.userSelect = 'none';
        
        // Content wrapper (área de trabajo infinita)
        this.canvas.contentWrapper.style.position = 'absolute';
        this.canvas.contentWrapper.style.top = '0';
        this.canvas.contentWrapper.style.left = '0';
        this.canvas.contentWrapper.style.width = `${this.canvas.baseSize}px`;
        this.canvas.contentWrapper.style.height = `${this.canvas.baseSize}px`;
        this.canvas.contentWrapper.style.transformOrigin = '0 0';
        this.canvas.contentWrapper.style.background = 'transparent';
        this.canvas.contentWrapper.style.transition = 'transform 0.1s ease-out';
        
        // Inicializar con zoom y posición centrada
        this.canvas.zoom = 1;
        this.centerCanvas();
    }

    /* =======================================
       MANEJO DE ZOOM Y PAN
       ======================================= */

    handleZoom(e) {
        e.preventDefault();
        
        const rect = this.canvas.element.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.canvas.minZoom, Math.min(this.canvas.maxZoom, this.canvas.zoom * zoomFactor));
        
        // Zoom hacia el punto del mouse (mantener posición relativa)
        const zoomRatio = newZoom / this.canvas.zoom;
        this.canvas.panX = mouseX - (mouseX - this.canvas.panX) * zoomRatio;
        this.canvas.panY = mouseY - (mouseY - this.canvas.panY) * zoomRatio;
        
        this.canvas.zoom = newZoom;
        this.updateCanvasTransform();
    }

    handleMouseDown(e) {
        if (e.button === 0) { // Botón izquierdo
            this.canvas.isDragging = true;
            this.canvas.dragStart.x = e.clientX - this.canvas.panX;
            this.canvas.dragStart.y = e.clientY - this.canvas.panY;
            this.canvas.element.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (this.canvas.isDragging) {
            this.canvas.panX = e.clientX - this.canvas.dragStart.x;
            this.canvas.panY = e.clientY - this.canvas.dragStart.y;
            this.updateCanvasTransform();
        }
    }

    handleMouseUp(e) {
        this.canvas.isDragging = false;
        this.canvas.element.style.cursor = 'grab';
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.canvas.isDragging = true;
            this.canvas.dragStart.x = touch.clientX - this.canvas.panX;
            this.canvas.dragStart.y = touch.clientY - this.canvas.panY;
        }
    }

    handleTouchMove(e) {
        if (this.canvas.isDragging && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this.canvas.panX = touch.clientX - this.canvas.dragStart.x;
            this.canvas.panY = touch.clientY - this.canvas.dragStart.y;
            this.updateCanvasTransform();
        }
    }

    handleTouchEnd(e) {
        this.canvas.isDragging = false;
    }

    updateCanvasTransform() {
        if (!this.canvas.contentWrapper) return;
        
        const transform = `translate(${this.canvas.panX}px, ${this.canvas.panY}px) scale(${this.canvas.zoom})`;
        this.canvas.contentWrapper.style.transform = transform;
        
        // Actualizar el fondo del canvas para que sea infinito
        this.updateCanvasBackground();
    }

    /* =======================================
       CONTROL DEL CANVAS
       ======================================= */

    centerCanvas() {
        const rect = this.canvas.element.getBoundingClientRect();
        // Centrar el content wrapper en el viewport
        this.canvas.panX = (rect.width - this.canvas.baseSize) / 2;
        this.canvas.panY = (rect.height - this.canvas.baseSize) / 2;
        this.canvas.zoom = 1;
        this.updateCanvasTransform();
    }

    resetCanvas() {
        this.canvas.panX = 0;
        this.canvas.panY = 0;
        this.canvas.zoom = 1;
        this.updateCanvasTransform();
    }

    fitToContent() {
        if (this.canvas.objects.length === 0) {
            this.centerCanvas();
            return;
        }

        // Calcular bounds de todos los objetos
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        this.canvas.objects.forEach(obj => {
            if (obj.position) {
                minX = Math.min(minX, obj.position.x);
                minY = Math.min(minY, obj.position.y);
                maxX = Math.max(maxX, obj.position.x);
                maxY = Math.max(maxY, obj.position.y);
            }
        });

        if (minX === Infinity) {
            this.centerCanvas();
            return;
        }

        // Calcular zoom y posición para mostrar todo el contenido
        const rect = this.canvas.element.getBoundingClientRect();
        const contentWidth = maxX - minX + 400; // Margen extra
        const contentHeight = maxY - minY + 400;
        
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        const scale = Math.min(scaleX, scaleY, this.canvas.maxZoom);
        
        this.canvas.zoom = Math.max(scale, this.canvas.minZoom);
        
        // Centrar el contenido
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        this.canvas.panX = rect.width / 2 - centerX * this.canvas.zoom;
        this.canvas.panY = rect.height / 2 - centerY * this.canvas.zoom;
        
        this.updateCanvasTransform();
    }

    clearCanvas() {
        // Remover TODOS los elementos INMEDIATAMENTE sin delays
        this.canvas.objects.forEach(obj => {
            if (obj && obj.element && obj.element.parentNode) {
                obj.element.remove();
            }
        });
        
        this.canvas.loadingCards.forEach(card => {
            if (card && card.element && card.element.parentNode) {
                card.element.remove();
            }
        });
        
        // Limpiar arrays
        this.canvas.objects = [];
        this.canvas.loadingCards = [];
        
        // Resetear transformaciones
        this.canvas.panX = 0;
        this.canvas.panY = 0;
        this.canvas.zoom = 1;
        this.updateCanvasTransform();
        
        // Optimización: Forzar garbage collection de imágenes
        if (typeof window.gc === 'function') {
            try {
                window.gc();
            } catch(e) {}
        }
        
        console.log('Canvas limpiado correctamente');
    }
    
    // Método para limpiar todos los event listeners
    cleanup() {
        console.log('Limpiando CanvasManager...');
        // Los event listeners se limpian automáticamente al remover el elemento
        this.clearCanvas();
    }

    /* =======================================
       SISTEMA DE OBJETOS
       ======================================= */

    createCanvasObject(type, data, position = null) {
        if (!this.canvas.contentWrapper || !type) {
            return null;
        }
        
        const object = {
            id: Date.now() + Math.random(),
            type: type,
            data: data,
            position: position || this.getRandomPosition(),
            visible: true,
            element: null
        };

        this.canvas.objects.push(object);
        this.renderCanvasObject(object);
        return object;
    }

    getRandomPosition() {
        // Usar el área de trabajo infinita para posicionamiento
        const margin = 200;
        const cardWidth = 400; // --card-width
        const cardHeight = 700; // --card-height
        return {
            x: Math.random() * (this.canvas.baseSize - cardWidth * 2) + margin + cardWidth,
            y: Math.random() * (this.canvas.baseSize - cardHeight * 2) + margin + cardHeight
        };
    }

    renderCanvasObject(object) {
        if (!this.canvas.contentWrapper || !object.type) {
            console.error('No se puede renderizar: contentWrapper o type no válido');
            return;
        }
        
        const element = document.createElement('div');
        element.className = `canvas-object canvas-object-${object.type}`;
        element.style.position = 'absolute';
        element.style.left = `${object.position.x}px`;
        element.style.top = `${object.position.y}px`;
        element.style.transform = 'translate(-50%, -50%)';
        element.style.zIndex = '10';
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.3s ease-in-out';

        switch (object.type) {
            case 'loading-card':
                element.innerHTML = this.createLoadingCardHTML();
                break;
            case 'script-card':
                element.innerHTML = this.createScriptCardHTML(object.data);
                break;
            case 'image-card':
                element.innerHTML = this.createImageCardHTML(object.data);
                break;
            case 'video-card':
                element.innerHTML = this.createVideoCardHTML(object.data);
                break;
        }

        try {
            this.canvas.contentWrapper.appendChild(element);
            object.element = element;
            
            setTimeout(() => {
                element.style.opacity = '1';
            }, 100);
        } catch (error) {
            console.error('Error agregando elemento al canvas:', error);
        }
    }

    /* =======================================
       TEMPLATES DE CARDS
       ======================================= */

    createLoadingCardHTML() {
        return `
            <div class="loading-card">
                <div class="loading-card-content">
                    <div class="loading-shimmer"></div>
                </div>
            </div>
        `;
    }

    createScriptCardHTML(data) {
        return `
            <div class="script-card">
                <div class="card-header">
                    <h3>Guion ${data.title || data.id}</h3>
                    <div class="card-actions">
                        <button class="btn-icon" title="Copiar al portapapeles" onclick="window.canvasManager.copyVariantToClipboard('${data.id}')">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn-icon" title="Expandir detalles" onclick="window.canvasManager.toggleCardDetails('${data.id}')">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    ${data.content || '<p>Contenido no disponible</p>'}
                </div>
                <div class="card-footer">
                    <div class="action-buttons">
                        <button class="btn-action btn-correction" onclick="window.canvasManager.showCorrectionModal('${data.id}')">
                            <i class="fas fa-edit"></i>
                            <span>Corrección</span>
                        </button>
                        <button class="btn-action btn-regenerate" onclick="window.canvasManager.regenerateScript('${data.id}')">
                            <i class="fas fa-redo"></i>
                            <span>Regenerar</span>
                        </button>
                        <button class="btn-action btn-create" onclick="window.canvasManager.createImages('${data.id}')">
                            <i class="fas fa-image"></i>
                            <span>Crear</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    createImageCardHTML(data) {
        return `
            <div class="image-card">
                <div class="card-header">
                    <h3>Imagen</h3>
                    <div class="card-actions">
                        <button class="btn-icon" title="Descargar" onclick="window.canvasManager.downloadImage('${data.url}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <img src="${data.url}" alt="Imagen generada" class="generated-image">
                </div>
            </div>
        `;
    }

    createVideoCardHTML(data) {
        return `
            <div class="video-card">
                <div class="card-header">
                    <h3>Video</h3>
                    <div class="card-actions">
                        <button class="btn-icon" title="Reproducir" onclick="window.canvasManager.playVideo('${data.id}')">
                            <i class="fas fa-play"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <video controls class="generated-video">
                        <source src="${data.url}" type="video/mp4">
                    </video>
                </div>
            </div>
        `;
    }

    /* =======================================
       ANIMACIONES DE CARGA
       ======================================= */

    showLoadingAnimation() {
        if (!this.canvas.contentWrapper) return;
        
        this.canvas.isGenerating = true;
        this.clearCanvas();
        
        // Crear 3 cards de carga INMEDIATAMENTE sin delay
        for (let i = 0; i < 3; i++) {
            const loadingCard = this.createCanvasObject('loading-card', {}, {
                x: 300 + (i * 450),
                y: 300 + (i * 50)
            });
            
            if (loadingCard) {
                this.canvas.loadingCards.push(loadingCard);
            }
        }
    }

    hideLoadingAnimation() {
        // Remover todas las cards de loading inmediatamente SIN delays
        this.canvas.loadingCards.forEach(card => {
            if (card && card.element && card.element.parentNode) {
                card.element.remove();
            }
        });
        this.canvas.loadingCards = [];
        this.canvas.isGenerating = false;
    }

    /* =======================================
       PROCESAMIENTO DE RESPUESTAS
       ======================================= */

    async processWebhookResponse(response) {
        try {
            // Limpiar canvas PRIMERO para evitar parpadeos
            this.clearCanvas();
            
            // Solo procesar si es un array y tiene datos
            if (Array.isArray(response) && response.length > 0) {
                // Limitar exactamente a 3 items
                const limitedResponse = response.slice(0, 3);
                
                // Procesar variantes inmediatamente sin delays
                this.processVariantsResponse(limitedResponse);
                
                // Ajustar vista después de que se rendericen las cards
                setTimeout(() => {
                    this.fitToContent();
                }, 1000);
            }
            
        } catch (error) {
            console.error('Error procesando respuesta:', error);
            this.clearCanvas();
        }
    }

    /**
     * Procesar respuesta con variantes (nuevo formato)
     * @param {Array} variants - Array de variantes de guiones
     */
    processVariantsResponse(variants) {
        if (!Array.isArray(variants) || variants.length === 0) return;
        
        // Limpiar canvas primero
        this.clearCanvas();
        
        // Crear cards inmediatamente sin delays largos
        variants.forEach((variant, variantIndex) => {
            if (!variant) return;
            
            const cardData = {
                id: `variant_${variantIndex + 1}`,
                title: variant.variante ? `Variante ${variant.variante}` : `Variante ${variantIndex + 1}`,
                content: this.formatVariantContent(variant),
                type: 'script-card',
                variant: variant
            };

            // Delay mínimo solo para animación visual
            setTimeout(() => {
                this.createCanvasObject('script-card', cardData, {
                    x: 300 + (variantIndex * 450),
                    y: 300 + (variantIndex * 50)
                });
            }, variantIndex * 200);
        });
    }

    /**
     * Formatear contenido de una variante para mostrar en la card
     * @param {Object} variant - Variante del guión
     * @returns {string} - Contenido formateado
     */
    formatVariantContent(variant) {
        if (!variant) return '<p>Sin contenido</p>';
        
        let content = '';
        
        const safeText = (text) => (text || '').toString().substring(0, 500);
        
        // Título de la variante
        content += `<div class="variant-header">
            <h3>Variante ${variant.variante || 'N/A'}</h3>
            <span class="variant-badge">${(variant.roles && variant.roles.length) || 0} roles</span>
        </div>`;
        
        // Información del contexto
        if (variant.guion && variant.guion.context) {
            const ctx = variant.guion.context;
            content += `<div class="context-section">
                <h4>Contexto</h4>
                ${ctx.place ? `<div class="context-item"><strong>Lugar:</strong> ${safeText(ctx.place)}</div>` : ''}
                ${ctx.time ? `<div class="context-item"><strong>Momento:</strong> ${safeText(ctx.time)}</div>` : ''}
                ${ctx.why_now ? `<div class="context-item"><strong>Motivación:</strong> ${safeText(ctx.why_now)}</div>` : ''}
                ${ctx.subject_profile ? `<div class="context-item"><strong>Perfil:</strong> ${safeText(ctx.subject_profile)}</div>` : ''}
                ${ctx.subject_voice ? `<div class="context-item"><strong>Voz:</strong> ${safeText(ctx.subject_voice)}</div>` : ''}
            </div>`;
        }
        
        // Clips organizados por roles (limitado a 5 clips)
        if (variant.guion && variant.guion.clips && Array.isArray(variant.guion.clips)) {
            const clips = variant.guion.clips.slice(0, 5);
            content += `<div class="clips-section">
                <h4>Clips (${clips.length})</h4>`;
            
            clips.forEach((clip, index) => {
                content += `<div class="clip-item">
                    <div class="clip-header">
                        <span class="clip-number">Clip ${index + 1}</span>
                        ${clip.role ? `<span class="clip-role">${safeText(clip.role)}</span>` : ''}
                        ${clip.dur ? `<span class="clip-duration">${clip.dur}s</span>` : ''}
                    </div>
                    <div class="clip-content">
                        ${clip.scene_prompt ? `<p class="clip-prompt">${safeText(clip.scene_prompt)}</p>` : ''}
                        ${clip.voice_over ? `<p class="clip-voice"><strong>Voice-over:</strong> "${safeText(clip.voice_over)}"</p>` : ''}
                        ${clip.notes && clip.notes.camera ? `<div class="clip-notes"><div class="notes-grid"><div><strong>Cámara:</strong> ${safeText(clip.notes.camera)}</div></div></div>` : ''}
                    </div>
                </div>`;
            });
            
            content += `</div>`;
        }
        
        return content;
    }

    /**
     * Procesar respuesta en formato anterior
     * @param {Object} response - Respuesta del webhook
     */
    processLegacyResponse(response) {
        // Procesar guiones
        if (response.scripts && Array.isArray(response.scripts)) {
            response.scripts.forEach((script, index) => {
                setTimeout(() => {
                    this.createCanvasObject('script-card', script, {
                        x: 200 + (index * 350),
                        y: 200
                    });
                }, index * this.animations.cardAppearDelay);
            });
        }
        
        // Procesar imágenes
        if (response.images && Array.isArray(response.images)) {
            response.images.forEach((image, index) => {
                setTimeout(() => {
                    this.createCanvasObject('image-card', image, {
                        x: 200 + (index * 350),
                        y: 400
                    });
                }, (response.scripts?.length || 0) * this.animations.cardAppearDelay + index * this.animations.cardAppearDelay);
            });
        }
        
        // Procesar videos
        if (response.videos && Array.isArray(response.videos)) {
            response.videos.forEach((video, index) => {
                setTimeout(() => {
                    this.createCanvasObject('video-card', video, {
                        x: 200 + (index * 350),
                        y: 600
                    });
                }, ((response.scripts?.length || 0) + (response.images?.length || 0)) * this.animations.cardAppearDelay + index * this.animations.cardAppearDelay);
            });
        }
    }

    /* =======================================
       FUNCIONES AUXILIARES
       ======================================= */

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copiado al portapapeles', 'success');
        }).catch(() => {
            this.showNotification('Error copiando al portapapeles', 'error');
        });
    }

    copyVariantToClipboard(variantId) {
        const variantObj = this.canvas.objects.find(obj => obj.id === variantId);
        if (variantObj && variantObj.data) {
            const variant = variantObj.data.variant;
            const text = JSON.stringify(variant, null, 2);
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('Variante copiada al portapapeles', 'success');
            }).catch(() => {
                this.showNotification('Error copiando variante', 'error');
            });
        }
    }

    toggleCardDetails(cardId) {
        console.log('Toggle card details:', cardId);
        // Implementar expansión de detalles
        this.showNotification('Funcionalidad de expansión próximamente', 'info');
    }

    downloadImage(url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `imagen-${Date.now()}.jpg`;
        link.click();
        this.showNotification('Descargando imagen...', 'info');
    }

    playVideo(videoId) {
        console.log('Reproduciendo video:', videoId);
        this.showNotification('Reproduciendo video...', 'info');
    }

    showNotification(message, type = 'info') {
        // Implementar sistema de notificaciones
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    /* =======================================
       FUNCIONES DE ACCIONES DE CARDS
       ======================================= */

    /**
     * Mostrar modal de corrección
     * @param {string} cardId - ID de la card
     */
    showCorrectionModal(cardId) {
        console.log('Mostrando modal de corrección para:', cardId);
        
        // Crear overlay
        const overlay = document.createElement('div');
        overlay.className = 'correction-modal-overlay';
        overlay.id = 'correction-modal-overlay';
        
        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'correction-modal';
        modal.innerHTML = `
            <div class="correction-modal-header">
                <h3>Corrección de Guion</h3>
                <button class="correction-modal-close" onclick="window.canvasManager.closeCorrectionModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="correction-modal-body">
                <label for="correction-text">Especifica qué quieres cambiar de este guion:</label>
                <textarea 
                    id="correction-text" 
                    placeholder="Ejemplo: Cambiar el tono a más formal, agregar más detalles sobre el producto, modificar la duración de los clips..."
                    rows="5"
                ></textarea>
            </div>
            <div class="correction-modal-footer">
                <button class="correction-modal-btn correction-modal-btn-cancel" onclick="window.canvasManager.closeCorrectionModal()">
                    Cancelar
                </button>
                <button class="correction-modal-btn correction-modal-btn-submit" onclick="window.canvasManager.submitCorrection('${cardId}')">
                    Enviar Corrección
                </button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Mostrar modal con animación
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // Focus en el textarea
        setTimeout(() => {
            document.getElementById('correction-text').focus();
        }, 300);
    }

    /**
     * Cerrar modal de corrección
     */
    closeCorrectionModal() {
        const overlay = document.getElementById('correction-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
    }

    /**
     * Enviar corrección
     * @param {string} cardId - ID de la card
     */
    submitCorrection(cardId) {
        const correctionText = document.getElementById('correction-text').value.trim();
        
        if (!correctionText) {
            this.showNotification('Por favor especifica qué quieres cambiar', 'error');
            return;
        }
        
        console.log('Enviando corrección para:', cardId, 'Texto:', correctionText);
        
        // Obtener datos de la card
        const cardObject = this.canvas.objects.find(obj => obj.id === cardId);
        if (!cardObject) {
            this.showNotification('No se encontró la card', 'error');
            return;
        }
        
        // Preparar datos para envío
        const correctionData = {
            original_script: cardObject.data.variant,
            correction_request: correctionText,
            metadata: {
                timestamp: new Date().toISOString(),
                card_id: cardId,
                action: 'correction'
            }
        };
        
        // Enviar al webhook de generación (mismo que genera guiones)
        this.sendCorrectionToWebhook(correctionData);
        
        // Cerrar modal
        this.closeCorrectionModal();
        
        this.showNotification('Corrección enviada correctamente', 'success');
    }

    /**
     * Regenerar guion
     * @param {string} cardId - ID de la card
     */
    regenerateScript(cardId) {
        console.log('Regenerando guion para:', cardId);
        
        // Obtener datos de la card
        const cardObject = this.canvas.objects.find(obj => obj.id === cardId);
        if (!cardObject) {
            this.showNotification('No se encontró la card', 'error');
            return;
        }
        
        // Preparar datos para regeneración
        const regenerateData = {
            original_script: cardObject.data.variant,
            action: 'regenerate',
            metadata: {
                timestamp: new Date().toISOString(),
                card_id: cardId
            }
        };
        
        // Enviar al webhook de generación
        this.sendRegenerateToWebhook(regenerateData);
        
        this.showNotification('Regenerando guion...', 'info');
    }

    /**
     * Crear imágenes de escenas
     * @param {string} cardId - ID de la card
     */
    createImages(cardId) {
        console.log('Creando imágenes para:', cardId);
        
        // Obtener datos de la card
        const cardObject = this.canvas.objects.find(obj => obj.id === cardId);
        if (!cardObject) {
            this.showNotification('No se encontró la card', 'error');
            return;
        }
        
        // Preparar datos para creación de imágenes
        const imageData = {
            script: cardObject.data.variant,
            action: 'create_images',
            metadata: {
                timestamp: new Date().toISOString(),
                card_id: cardId
            }
        };
        
        // Enviar al webhook de creación de imágenes
        this.sendCreateImagesToWebhook(imageData);
        
        this.showNotification('Creando imágenes de escenas...', 'info');
    }

    /**
     * Enviar corrección al webhook
     * @param {Object} data - Datos de corrección
     */
    async sendCorrectionToWebhook(data) {
        try {
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            console.log('Corrección enviada al webhook');
        } catch (error) {
            console.error('Error enviando corrección:', error);
            this.showNotification('Error enviando corrección', 'error');
        }
    }

    /**
     * Enviar regeneración al webhook
     * @param {Object} data - Datos de regeneración
     */
    async sendRegenerateToWebhook(data) {
        try {
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            console.log('Regeneración enviada al webhook');
        } catch (error) {
            console.error('Error enviando regeneración:', error);
            this.showNotification('Error enviando regeneración', 'error');
        }
    }

    /**
     * Enviar creación de imágenes al webhook
     * @param {Object} data - Datos de creación de imágenes
     */
    async sendCreateImagesToWebhook(data) {
        try {
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c';
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            console.log('Creación de imágenes enviada al webhook');
        } catch (error) {
            console.error('Error enviando creación de imágenes:', error);
            this.showNotification('Error enviando creación de imágenes', 'error');
        }
    }

    updateCanvasBackground() {
        if (!this.canvas.element) return;
        
        // Crear un fondo infinito dinámico basado en la posición y zoom
        const gridSize = 20 * this.canvas.zoom;
        const offsetX = (this.canvas.panX % gridSize) / this.canvas.zoom;
        const offsetY = (this.canvas.panY % gridSize) / this.canvas.zoom;
        
        this.canvas.element.style.background = `
            radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
        `;
        this.canvas.element.style.backgroundSize = `${gridSize}px ${gridSize}px, ${gridSize * 2}px ${gridSize * 2}px`;
        this.canvas.element.style.backgroundPosition = `${offsetX}px ${offsetY}px, ${offsetX * 2}px ${offsetY * 2}px`;
    }

    debugCanvas() {
        console.log('=== DEBUG CANVAS ===');
        console.log('Canvas element:', this.canvas.element);
        console.log('Content wrapper:', this.canvas.contentWrapper);
        console.log('Canvas dimensions:', {
            width: this.canvas.element?.offsetWidth,
            height: this.canvas.element?.offsetHeight
        });
        console.log('Content wrapper dimensions:', {
            width: this.canvas.contentWrapper?.offsetWidth,
            height: this.canvas.contentWrapper?.offsetHeight
        });
        console.log('Transform:', {
            panX: this.canvas.panX,
            panY: this.canvas.panY,
            zoom: this.canvas.zoom
        });
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.canvasManager = new CanvasManager();
});
