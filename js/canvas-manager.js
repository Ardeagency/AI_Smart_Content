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
            // Asegurar que tenemos el canvas element
            if (!this.canvas.element) {
                this.canvas.element = document.querySelector('.canvas-area');
            }
            
            if (!this.canvas.element) {
                console.error('❌ Canvas element no encontrado');
                return;
            }
            
            // Crear el wrapper
            this.canvas.contentWrapper = document.createElement('div');
            this.canvas.contentWrapper.id = 'canvas-content-wrapper';
            this.canvas.element.appendChild(this.canvas.contentWrapper);
            console.log('✅ ContentWrapper creado');
        }
        
        // Crear contenedor SVG para líneas de conexión si no existe
        this.createConnectionLinesContainer();
    }
    
    /**
     * Asegurar que el contentWrapper existe (recréalo si fue eliminado)
     */
    ensureContentWrapper() {
        this.canvas.contentWrapper = document.getElementById('canvas-content-wrapper');
        if (!this.canvas.contentWrapper) {
            console.warn('⚠️ contentWrapper no existe, recreando...');
            this.createContentWrapper();
        }
    }
    
    createConnectionLinesContainer() {
        // Verificar si ya existe
        this.canvas.connectionsContainer = document.getElementById('canvas-connections-svg');
        
        if (!this.canvas.connectionsContainer) {
            // Crear contenedor SVG
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'canvas-connections-svg';
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.style.zIndex = '5'; // Debajo de las cards pero visible
            
            this.canvas.contentWrapper.appendChild(svg);
            this.canvas.connectionsContainer = svg;
            
            // Inicializar array de conexiones
            if (!this.canvas.connections) {
                this.canvas.connections = [];
            }
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
        
        // Actualizar también el SVG de conexiones
        if (this.canvas.connectionsContainer) {
            this.canvas.connectionsContainer.style.transform = transform;
        }
        
        // Actualizar todas las líneas de conexión
        if (this.canvas.connections && this.canvas.connections.length > 0) {
            this.canvas.connections.forEach(connection => {
                this.updateConnectionLine(connection.scriptId, connection.scenesId);
            });
        }
        
        // Actualizar el fondo del canvas para que sea infinito
        this.updateCanvasBackground();
    }
    
    /**
     * Actualizar posición de una línea de conexión específica
     * @param {string} scriptId - ID de la card del guion
     * @param {string} scenesId - ID de la card de escenas
     */
    updateConnectionLine(scriptId, scenesId) {
        const connectionId = `connection_${scriptId}_${scenesId}`;
        const line = document.getElementById(connectionId);
        
        if (!line) return;
        
        const scriptCard = this.canvas.objects.find(obj => obj.id === scriptId);
        const scenesCard = this.canvas.objects.find(obj => obj.id === scenesId);
        
        if (!scriptCard || !scenesCard || !scriptCard.element || !scenesCard.element) return;
        
        const getCardCenter = (card, element) => {
            const rect = element.getBoundingClientRect();
            const canvasRect = this.canvas.element.getBoundingClientRect();
            
            const x = (rect.left - canvasRect.left + rect.width / 2 - this.canvas.panX) / this.canvas.zoom;
            const y = (rect.top - canvasRect.top + rect.height / 2 - this.canvas.panY) / this.canvas.zoom;
            
            return { x, y };
        };
        
        const scriptCenter = getCardCenter(scriptCard, scriptCard.element);
        const scenesCenter = getCardCenter(scenesCard, scenesCard.element);
        
        const startX = scriptCenter.x;
        const startY = scriptCenter.y + (scriptCard.element.offsetHeight / 2) / this.canvas.zoom;
        const endX = scenesCenter.x;
        const endY = scenesCenter.y - (scenesCard.element.offsetHeight / 2) / this.canvas.zoom;
        
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', endX);
        line.setAttribute('y2', endY);
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
        
        // Limpiar líneas de conexión
        if (this.canvas.connections && this.canvas.connections.length > 0) {
            this.canvas.connections.forEach(connection => {
                if (connection.element && connection.element.parentNode) {
                    connection.element.remove();
                }
            });
        }
        
        // Limpiar SVG de conexiones
        if (this.canvas.connectionsContainer) {
            this.canvas.connectionsContainer.innerHTML = '';
        }
        
        // Limpiar arrays
        this.canvas.objects = [];
        this.canvas.loadingCards = [];
        this.canvas.connections = [];
        
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
        // Asegurar que el contentWrapper existe antes de renderizar
        this.ensureContentWrapper();
        
        if (!this.canvas.contentWrapper || !object.type) {
            console.error('❌ No se puede renderizar: contentWrapper o type no válido', {
                hasWrapper: !!this.canvas.contentWrapper,
                type: object.type
            });
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
            case 'scenes-card':
                element.innerHTML = this.createScenesCardHTML(object.data);
                break;
            case 'video-card':
                element.innerHTML = this.createVideoCardHTML(object.data);
                break;
        }

        try {
            this.canvas.contentWrapper.appendChild(element);
            object.element = element;
            
            console.log(`✅ Elemento ${object.type} agregado al DOM en posición (${object.position.x}, ${object.position.y})`);
            
            // Forzar visibilidad y verificar que esté en el DOM
            setTimeout(() => {
                element.style.opacity = '1';
                
                // Verificar que el elemento esté realmente en el DOM
                if (!element.parentNode) {
                    console.error('❌ Elemento no está en el DOM después de agregarlo');
                    // Intentar agregarlo de nuevo
                    this.ensureContentWrapper();
                    if (this.canvas.contentWrapper) {
                        this.canvas.contentWrapper.appendChild(element);
                    }
                } else {
                    console.log(`✅ Elemento ${object.type} visible en el DOM`);
                }
            }, 100);
        } catch (error) {
            console.error('❌ Error agregando elemento al canvas:', error);
            // Recrear contentWrapper si es necesario
            this.ensureContentWrapper();
            if (this.canvas.contentWrapper) {
                try {
                    this.canvas.contentWrapper.appendChild(element);
                    object.element = element;
                } catch (retryError) {
                    console.error('❌ Error al reintentar agregar elemento:', retryError);
                }
            }
        }
    }

    /* =======================================
       TEMPLATES DE CARDS
       ======================================= */

    createLoadingCardHTML() {
        // Estilos inline mínimos para asegurar visibilidad aunque falten CSS externos
        const containerStyle = [
            'width: 360px',
            'height: 220px',
            'border-radius: 16px',
            'background: rgba(255,255,255,0.04)',
            'border: 1px solid rgba(255,255,255,0.08)',
            'backdrop-filter: blur(2px)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'overflow: hidden'
        ].join(';');

        const spinnerStyle = [
            'width: 36px',
            'height: 36px',
            'border: 3px solid rgba(255,255,255,0.2)',
            'border-top-color: #FD624F',
            'border-radius: 50%',
            'animation: cm_spin 0.9s linear infinite'
        ].join(';');

        // Inyectar keyframes locales para el spinner
        return `
            <style>@keyframes cm_spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
            <div class="loading-card" style="${containerStyle}">
                <div style="${spinnerStyle}"></div>
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
        const title = data.title || data.scene || data.description || 'Imagen de Escena';
        const imageUrl = data.url || data.image_url || '';
        const altText = data.title || data.scene || 'Imagen generada';
        
        return `
            <div class="image-card">
                <div class="card-header">
                    <h3>${title}</h3>
                    <div class="card-actions">
                        <button class="btn-icon" title="Descargar" onclick="window.canvasManager.downloadImage('${imageUrl}')">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon" title="Expandir detalles" onclick="window.canvasManager.toggleCardDetails('${data.id}')">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <img src="${imageUrl}" alt="${altText}" class="generated-image" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkltYWdlbiBubyBkaXNwb25pYmxlPC90ZXh0Pgo8L3N2Zz4='">
                    ${data.description ? `<p class="image-description">${data.description}</p>` : ''}
                </div>
            </div>
        `;
    }

    createScenesCardHTML(data) {
        const title = data.title || 'Escenas';
        const images = data.images || [];
        
        // Generar cápsulas para cada imagen (máximo 3)
        const capsulesHTML = images.slice(0, 3).map((image, index) => {
            const formatClass = `capsule-${image.format || 'square'}`;
            const imageUrl = image.url || '';
            const sceneTitle = image.scene || image.description || `Escena ${index + 1}`;
            
            return `
                <div class="scene-capsule ${formatClass}" data-index="${index}">
                    <div class="capsule-image-wrapper">
                        <img src="${imageUrl}" alt="${sceneTitle}" class="capsule-image" 
                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkltYWdlbjwvdGV4dD4KPC9zdmc+'">
                    </div>
                    <div class="capsule-label">${sceneTitle}</div>
                    <button class="capsule-download" onclick="window.canvasManager.downloadImage('${imageUrl}')" title="Descargar">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        return `
            <div class="scenes-card">
                <div class="scenes-card-header">
                    <h3>${title}</h3>
                    <div class="card-actions">
                        <button class="btn-icon" title="Descargar todas las imágenes" onclick="window.canvasManager.downloadAllScenes('${data.id}')">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon" title="Expandir detalles" onclick="window.canvasManager.toggleCardDetails('${data.id}')">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                </div>
                <div class="scenes-card-content">
                    <div class="scenes-gallery">
                        ${capsulesHTML}
                    </div>
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
        // Asegurar que el contentWrapper existe, recrearlo si fue eliminado
        this.ensureContentWrapper();
        
        if (!this.canvas.contentWrapper) {
            console.error('❌ No se pudo crear contentWrapper');
            return;
        }
        
        console.log('🎬 Iniciando animación de carga...');
        this.canvas.isGenerating = true;
        
        // Limpiar canvas pero preservar loading cards si ya existen
        this.canvas.objects.forEach(obj => {
            // Solo eliminar objetos que NO sean loading cards
            if (obj.type !== 'loading-card' && obj.element && obj.element.parentNode) {
                obj.element.remove();
            }
        });
        // Filtrar objects para mantener solo loading cards
        this.canvas.objects = this.canvas.objects.filter(obj => obj.type === 'loading-card');
        
        // Sincronizar loadingCards con objects que son loading-card
        this.canvas.loadingCards = this.canvas.objects.filter(obj => obj.type === 'loading-card');
        
        // Si ya hay loading cards visibles y en el DOM, no crear nuevas
        const visibleLoadingCards = this.canvas.loadingCards.filter(card => 
            card && card.element && card.element.parentNode
        );
        
        if (visibleLoadingCards.length > 0) {
            console.log(`✅ Ya hay ${visibleLoadingCards.length} cards de carga visibles, preservando...`);
            this.canvas.loadingCards = visibleLoadingCards;
            return;
        }
        
        // Crear 3 cards de carga INMEDIATAMENTE sin delay
        console.log('📦 Creando 3 cards de carga...');
        this.canvas.loadingCards = []; // Limpiar array antes de crear nuevas
        for (let i = 0; i < 3; i++) {
            const loadingCard = this.createCanvasObject('loading-card', {}, {
                x: 300 + (i * 450),
                y: 300 + (i * 50)
            });
            
            if (loadingCard) {
                this.canvas.loadingCards.push(loadingCard);
                console.log(`✅ Card de carga ${i + 1} creada:`, loadingCard.id);
            } else {
                console.error(`❌ Error creando card de carga ${i + 1}`);
            }
        }
        
        console.log(`✅ Animación de carga iniciada: ${this.canvas.loadingCards.length} cards visibles`);
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
        if (!Array.isArray(variants) || variants.length === 0) {
            console.warn('⚠️ processVariantsResponse: No hay variantes válidas');
            return;
        }
        
        console.log(`📝 Procesando ${variants.length} variante(s) de guiones...`);
        
        // Asegurar que el contentWrapper existe
        this.ensureContentWrapper();
        
        if (!this.canvas.contentWrapper) {
            console.error('❌ No se puede procesar variantes: contentWrapper no disponible');
            return;
        }
        
        // Limpiar solo objetos que no sean loading cards (mantener loading durante la transición)
        this.canvas.objects.forEach(obj => {
            if (obj.type !== 'loading-card' && obj.element && obj.element.parentNode) {
                obj.element.remove();
            }
        });
        this.canvas.objects = this.canvas.objects.filter(obj => obj.type === 'loading-card');
        
        // Ocultar animación de carga
        this.hideLoadingAnimation();
        
        // Crear cards con delay mínimo para animación visual
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
                const card = this.createCanvasObject('script-card', cardData, {
                    x: 300 + (variantIndex * 450),
                    y: 300 + (variantIndex * 50)
                });
                
                if (card) {
                    console.log(`✅ Card de variante ${variantIndex + 1} creada:`, card.id);
                } else {
                    console.error(`❌ Error creando card de variante ${variantIndex + 1}`);
                }
            }, variantIndex * 200);
        });
        
        // Ajustar vista después de crear las cards
        setTimeout(() => {
            this.fitToContent();
        }, variants.length * 200 + 300);
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

    /**
     * Descargar todas las imágenes de una card de escenas
     * @param {string} cardId - ID de la card de escenas
     */
    async downloadAllScenes(cardId) {
        console.log('📥 Descargando todas las escenas de:', cardId);
        
        const cardObject = this.canvas.objects.find(obj => obj.id === cardId);
        if (!cardObject || !cardObject.data || !cardObject.data.images) {
            this.showNotification('No se encontraron imágenes para descargar', 'error');
            return;
        }
        
        const images = cardObject.data.images;
        this.showNotification(`Descargando ${images.length} imágenes...`, 'info');
        
        // Descargar cada imagen con un pequeño delay para evitar bloqueo del navegador
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const imageUrl = image.url || image.image_url;
            
            if (imageUrl) {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `escena-${i + 1}-${Date.now()}.jpg`;
                    link.click();
                }, i * 300); // Delay de 300ms entre descargas
            }
        }
        
        setTimeout(() => {
            this.showNotification(`${images.length} imágenes descargadas`, 'success');
        }, images.length * 300);
    }

    /**
     * Crear línea de conexión entre un guion y su card de escenas
     * @param {string} scriptId - ID de la card del guion
     * @param {string} scenesId - ID de la card de escenas
     */
    createConnectionLine(scriptId, scenesId) {
        console.log('🔗 Creando línea de conexión:', scriptId, '→', scenesId);
        
        if (!this.canvas.connectionsContainer) {
            console.error('❌ Contenedor de conexiones no existe');
            return;
        }
        
        // Obtener ambas cards
        const scriptCard = this.canvas.objects.find(obj => obj.id === scriptId);
        const scenesCard = this.canvas.objects.find(obj => obj.id === scenesId);
        
        if (!scriptCard || !scenesCard || !scriptCard.element || !scenesCard.element) {
            console.warn('⚠️ Cards no encontradas para crear conexión');
            return;
        }
        
        // Crear línea si no existe
        const connectionId = `connection_${scriptId}_${scenesId}`;
        let line = document.getElementById(connectionId);
        
        if (!line) {
            // Crear nueva línea
            line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.id = connectionId;
            line.setAttribute('stroke', '#9C27B0');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '5,5');
            line.setAttribute('opacity', '0.6');
            line.style.transition = 'opacity 0.3s ease';
            
            // Asegurar que el SVG tenga el tamaño correcto
            const rect = this.canvas.element.getBoundingClientRect();
            this.canvas.connectionsContainer.setAttribute('width', rect.width * 2);
            this.canvas.connectionsContainer.setAttribute('height', rect.height * 2);
            this.canvas.connectionsContainer.setAttribute('viewBox', `0 0 ${rect.width * 2} ${rect.height * 2}`);
            
            this.canvas.connectionsContainer.appendChild(line);
            
            // Guardar referencia
            if (!this.canvas.connections) {
                this.canvas.connections = [];
            }
            this.canvas.connections.push({
                id: connectionId,
                scriptId: scriptId,
                scenesId: scenesId,
                element: line
            });
        }
        
        // Actualizar línea inicial
        this.updateConnectionLine(scriptId, scenesId);
        
        // También actualizar cuando se cargue la card completamente
        setTimeout(() => {
            this.updateConnectionLine(scriptId, scenesId);
        }, 200);
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
    async createImages(cardId) {
        console.log('🖼️ Creando imágenes para:', cardId);
        
        // Obtener datos de la card
        const cardObject = this.canvas.objects.find(obj => obj.id === cardId);
        if (!cardObject) {
            this.showNotification('No se encontró la card', 'error');
            return;
        }
        
        // Mostrar animación de carga
        const loadingCardId = `loading_images_${Date.now()}`;
        this.showLoadingAnimation('Generando imágenes de escenas...');
        
        try {
            // Recolectar todos los datos del sidebar (igual que para generación de guiones)
            let allSidebarData = {};
            if (window.dataCollector) {
                allSidebarData = await window.dataCollector.collectAllSidebarData();
                console.log('📦 Datos del sidebar recolectados:', allSidebarData);
            } else {
                console.warn('⚠️ DataCollector no está disponible, usando datos mínimos');
            }
            
            // Agregar el guion seleccionado al body completo
            const imageData = {
                ...allSidebarData, // Incluir todos los datos del sidebar: marca, producto, sujeto, oferta, audiencia, configuracion_avanzada, metadata
                selec_guion: cardObject.data.variant || cardObject.data, // El guion completo seleccionado por el usuario
                webhookUrl: 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702',
                executionMode: 'production',
                // Mantener compatibilidad con el código existente que procesa la respuesta
                script_id: cardId,
                script_data: cardObject.data.variant || cardObject.data
            };
            
            console.log('📤 Enviando datos completos al webhook de imágenes:', imageData);
            
            // Enviar al webhook de creación de imágenes
            await this.sendCreateImagesToWebhook(imageData);
        } catch (error) {
            console.error('❌ Error recolectando datos del sidebar:', error);
            // En caso de error, enviar solo el guion (fallback)
            const fallbackData = {
                selec_guion: cardObject.data.variant || cardObject.data,
                webhookUrl: 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702',
                executionMode: 'production',
                script_id: cardId,
                script_data: cardObject.data.variant || cardObject.data
            };
            await this.sendCreateImagesToWebhook(fallbackData);
        }
        
        // Si el webhook no responde directamente (modo no-cors), 
        // simular respuesta después de un tiempo
        // Si el webhook responde con CORS, processImageResponse se llamará desde sendCreateImagesToWebhook
        setTimeout(() => {
            // Solo procesar si no se ha procesado ya
            const hasProcessed = this.canvas.objects.some(obj => 
                obj.id && obj.id.startsWith(`image_${cardId}`)
            );
            
            if (!hasProcessed) {
                this.handleImageGenerationResponse(cardId, cardObject.data);
            }
        }, 3000);
    }
    
    /**
     * Manejar respuesta de generación de imágenes
     * @param {string} cardId - ID de la card original
     * @param {Object} scriptData - Datos del guion
     */
    handleImageGenerationResponse(cardId, scriptData) {
        console.log('📸 Procesando respuesta de imágenes para:', cardId);
        
        // Ocultar animación de carga
        this.hideLoadingAnimation();
        
        // En producción, esto vendría del webhook real
        // Por ahora, simulamos imágenes basadas en el guion
        this.processImageResponse(cardId, scriptData);
    }
    
    /**
     * Procesar respuesta con imágenes de escenas
     * @param {string} cardId - ID de la card original
     * @param {Object} scriptData - Datos del guion
     * @param {Array} images - Array de URLs de imágenes (opcional, para respuesta real)
     */
    async processImageResponse(cardId, scriptData, images = null) {
        console.log('🎨 Procesando imágenes de escenas...');
        
        // Si hay imágenes reales del webhook, usarlas
        // Si no, simular basado en el script
        let imageUrls = images;
        
        if (!imageUrls || !Array.isArray(imageUrls)) {
            // Extraer escenas del script para simular imágenes
            const scenes = this.extractScenesFromScript(scriptData);
            
            // Crear URLs simuladas (en producción estas vendrían del webhook)
            imageUrls = scenes.map((scene, index) => ({
                url: `https://via.placeholder.com/800x600/333333/ffffff?text=Escena+${index + 1}`,
                scene: scene,
                description: `Imagen de escena ${index + 1}`,
                id: `image_${cardId}_${index}`
            }));
        }
        
        // Convertir URLs a objetos con formato
        const imageObjects = await Promise.all(
            imageUrls.slice(0, 3).map(async (imageData, index) => {
                const imageUrl = imageData.url || imageData;
                const format = await this.getImageFormat(imageUrl);
                
                return {
                    id: imageData.id || `image_${cardId}_${index}`,
                    url: imageUrl,
                    format: format,
                    scene: imageData.scene || `Escena ${index + 1}`,
                    description: imageData.description,
                    index: index
                };
            })
        );
        
        // Crear una sola card de escenas con las 3 cápsulas
        const scenesCardData = {
            id: `scenes_card_${cardId}`,
            title: 'Escenas',
            images: imageObjects,
            script_id: cardId, // Guardar ID del guion que generó estas escenas
            type: 'scenes-card'
        };
        
        // Obtener posición del guion que generó estas escenas
        const scriptCard = this.canvas.objects.find(obj => obj.id === cardId);
        const scriptPosition = scriptCard ? { x: scriptCard.x, y: scriptCard.y } : { x: 300, y: 300 };
        
        // Posicionar la card de escenas debajo del guion con offset
        const scenesPosition = {
            x: scriptPosition.x,
            y: scriptPosition.y + 350 // Offset vertical para posicionar debajo
        };
        
        // Crear la card de escenas en el canvas con animación similar a guiones
        setTimeout(() => {
            this.createCanvasObject('scenes-card', scenesCardData, scenesPosition);
            
            // Crear línea de conexión después de que se renderice
            setTimeout(() => {
                this.createConnectionLine(cardId, scenesCardData.id);
                this.fitToContent();
            }, 400);
        }, 200);
        
        this.showNotification(`${imageObjects.length} imágenes de escenas generadas`, 'success');
    }
    
    /**
     * Extraer escenas del script
     * @param {Object} scriptData - Datos del guion
     * @returns {Array} - Array de escenas
     */
    extractScenesFromScript(scriptData) {
        const scenes = [];
        
        if (!scriptData || !scriptData.variant) return scenes;
        
        const variant = scriptData.variant;
        
        // Intentar extraer escenas de diferentes estructuras posibles
        if (variant.guion && variant.guion.clips) {
            variant.guion.clips.forEach((clip, index) => {
                if (clip.escena || clip.scene) {
                    scenes.push(clip.escena || clip.scene || `Escena ${index + 1}`);
                }
            });
        }
        
        // Si no hay clips, crear escenas basadas en roles o contenido
        if (scenes.length === 0) {
            const roles = variant.roles || [];
            roles.forEach((role, index) => {
                scenes.push(role.nombre ? `Escena ${role.nombre}` : `Escena ${index + 1}`);
            });
        }
        
        // Si aún no hay escenas, crear una por defecto
        if (scenes.length === 0) {
            scenes.push('Escena principal');
        }
        
        return scenes;
    }

    /**
     * Enviar corrección al webhook
     * @param {Object} data - Datos de corrección
     */
    async sendCorrectionToWebhook(data) {
        try {
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
            
            // Validar que data sea un objeto válido
            if (!data || typeof data !== 'object') {
                throw new Error('Los datos deben ser un objeto válido');
            }
            
            // Limpiar y estructurar el objeto antes de serializar
            const cleanedData = this.cleanJSONObject(data);
            
            // Convertir a JSON string y validar
            const jsonBody = JSON.stringify(cleanedData);
            if (!jsonBody || jsonBody === '{}' || jsonBody === 'null') {
                throw new Error('El JSON generado está vacío o es inválido');
            }
            
            console.log('📤 Enviando corrección al webhook:');
            console.log('Datos originales:', data);
            console.log('Datos limpios:', cleanedData);
            console.log('Datos (JSON string):', jsonBody);
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Accept': 'application/json'
                },
                body: jsonBody // JSON string bien formado (no objeto, fetch requiere string)
            }).catch(async (error) => {
                // Si falla con CORS, intentar con no-cors como fallback
                console.warn('⚠️ Intento con CORS falló, intentando con no-cors:', error);
                return await fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: jsonBody
                });
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
            
            // Validar que data sea un objeto válido
            if (!data || typeof data !== 'object') {
                throw new Error('Los datos deben ser un objeto válido');
            }
            
            // Limpiar y estructurar el objeto antes de serializar
            const cleanedData = this.cleanJSONObject(data);
            
            // Convertir a JSON string y validar
            const jsonBody = JSON.stringify(cleanedData);
            if (!jsonBody || jsonBody === '{}' || jsonBody === 'null') {
                throw new Error('El JSON generado está vacío o es inválido');
            }
            
            console.log('📤 Enviando regeneración al webhook:');
            console.log('Datos originales:', data);
            console.log('Datos limpios:', cleanedData);
            console.log('Datos (JSON string):', jsonBody);
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Accept': 'application/json'
                },
                body: jsonBody // JSON string bien formado (no objeto, fetch requiere string)
            }).catch(async (error) => {
                // Si falla con CORS, intentar con no-cors como fallback
                console.warn('⚠️ Intento con CORS falló, intentando con no-cors:', error);
                return await fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: jsonBody
                });
            });
            
            console.log('Regeneración enviada al webhook');
        } catch (error) {
            console.error('Error enviando regeneración:', error);
            this.showNotification('Error enviando regeneración', 'error');
        }
    }

    /**
     * Limpiar objeto antes de serializar a JSON
     * Elimina valores undefined, null innecesarios y asegura estructura válida
     * @param {*} obj - Objeto a limpiar
     * @returns {Object} - Objeto limpio y estructurado
     */
    cleanJSONObject(obj) {
        if (obj === null || obj === undefined) {
            return null;
        }
        
        if (typeof obj !== 'object') {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.cleanJSONObject(item)).filter(item => item !== undefined);
        }
        
        const cleaned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                if (value !== undefined) {
                    cleaned[key] = this.cleanJSONObject(value);
                }
            }
        }
        
        return cleaned;
    }

    async sendCreateImagesToWebhook(data) {
        try {
            const webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c';
            
            // Validar que data sea un objeto válido
            if (!data || typeof data !== 'object') {
                throw new Error('Los datos deben ser un objeto válido');
            }
            
            // Limpiar y estructurar el objeto antes de serializar
            const cleanedData = this.cleanJSONObject(data);
            
            // Convertir a JSON string y validar
            const jsonBody = JSON.stringify(cleanedData);
            if (!jsonBody || jsonBody === '{}' || jsonBody === 'null') {
                throw new Error('El JSON generado está vacío o es inválido');
            }
            
            console.log('📤 Enviando datos al webhook de imágenes:');
            console.log('URL:', webhookUrl);
            console.log('Datos originales:', data);
            console.log('Datos limpios:', cleanedData);
            console.log('Datos (JSON string):', jsonBody);
            console.log('Tamaño JSON:', jsonBody.length, 'bytes');
            
            // Verificar estructura del JSON
            try {
                const parsedCheck = JSON.parse(jsonBody);
                console.log('✅ JSON válido y parseable');
                console.log('Estructura:', {
                    tiene_marca: !!parsedCheck.marca,
                    tiene_producto: !!parsedCheck.producto,
                    tiene_sujeto: !!parsedCheck.sujeto,
                    tiene_selec_guion: !!parsedCheck.selec_guion,
                    tiene_webhookUrl: !!parsedCheck.webhookUrl,
                    tiene_executionMode: !!parsedCheck.executionMode
                });
            } catch (e) {
                console.error('❌ Error al parsear JSON:', e);
                throw new Error('El JSON generado no es válido: ' + e.message);
            }
            
            // Intentar primero con cors para obtener respuesta real con archivos binarios
            let response;
            try {
                response = await fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Accept': 'application/json'
                    },
                    body: jsonBody // JSON string bien formado (fetch requiere string, no objeto)
                });
                
                if (response.ok) {
                    // Verificar si la respuesta contiene archivos binarios
                    const contentType = response.headers.get('content-type') || '';
                    
                    if (contentType.includes('multipart/form-data') || contentType.includes('image/')) {
                        // Si la respuesta es multipart o contiene imágenes directamente
                        try {
                            const formData = await response.formData();
                            const imageFiles = [];
                            
                            for (const [key, value] of formData.entries()) {
                                if (value instanceof File || value instanceof Blob) {
                                    imageFiles.push(value);
                                }
                            }
                            
                            if (imageFiles.length > 0) {
                                console.log('✅ Archivos binarios recibidos desde formData:', imageFiles.length);
                                this.hideLoadingAnimation();
                                const scriptData = data.selec_guion || data.script_data || { variant: data.script };
                                this.processBinaryImages(data.script_id, scriptData, imageFiles);
                                return;
                            }
                        } catch (e) {
                            console.log('No es formData, intentando como blob/array buffer');
                        }
                        
                        // Intentar como blob
                        try {
                            const blob = await response.blob();
                            if (blob.type.startsWith('image/')) {
                                console.log('✅ Imagen binaria recibida como blob');
                                this.hideLoadingAnimation();
                                const scriptData = data.selec_guion || data.script_data || { variant: data.script };
                                this.processBinaryImages(data.script_id, scriptData, [blob]);
                                return;
                            }
                        } catch (e) {
                            console.log('No es blob, intentando como array buffer');
                        }
                        
                        // Intentar como array buffer (para múltiples imágenes)
                        try {
                            const arrayBuffer = await response.arrayBuffer();
                            const blob = new Blob([arrayBuffer]);
                            if (blob.size > 0) {
                                console.log('✅ Archivo binario recibido como array buffer');
                                this.hideLoadingAnimation();
                                const scriptData = data.selec_guion || data.script_data || { variant: data.script };
                                this.processBinaryImages(data.script_id, scriptData, [blob]);
                                return;
                            }
                        } catch (e) {
                            console.log('Error procesando array buffer:', e);
                        }
                    } else {
                        // Intentar como JSON
                        try {
                            const result = await response.json();
                            console.log('✅ Respuesta del webhook de imágenes (JSON):', result);
                            
                            this.hideLoadingAnimation();
                            
                            // Procesar respuesta JSON si existe
                            if (result.images && Array.isArray(result.images)) {
                                const scriptData = data.selec_guion || data.script_data || { variant: data.script };
                                this.processImageResponse(data.script_id, scriptData, result.images);
                                return;
                            } else if (result.files && Array.isArray(result.files)) {
                                // Convertir base64 o URLs a blobs si es necesario
                                const imageFiles = await Promise.all(
                                    result.files.map(async (file) => {
                                        if (file instanceof Blob || file instanceof File) {
                                            return file;
                                        } else if (typeof file === 'string' && file.startsWith('data:')) {
                                            // Base64
                                            const response = await fetch(file);
                                            return await response.blob();
                                        } else if (typeof file === 'string') {
                                            // URL
                                            const response = await fetch(file);
                                            return await response.blob();
                                        }
                                        return null;
                                    })
                                );
                                
                                const validFiles = imageFiles.filter(f => f !== null);
                                if (validFiles.length > 0) {
                                    this.processBinaryImages(data.script_id, data.script_data || { variant: data.script }, validFiles);
                                    return;
                                }
                            }
                        } catch (jsonError) {
                            console.error('Error parseando JSON:', jsonError);
                        }
                    }
                }
            } catch (corsError) {
                console.log('⚠️ CORS no permitido, usando modo no-cors');
            }
            
            // Fallback a no-cors si cors falla
            await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            console.log('✅ Creación de imágenes enviada al webhook');
        } catch (error) {
            console.error('❌ Error enviando creación de imágenes:', error);
            this.hideLoadingAnimation();
            this.showNotification('Error enviando creación de imágenes', 'error');
        }
    }
    
    /**
     * Procesar archivos binarios de imágenes
     * @param {string} cardId - ID de la card original
     * @param {Object} scriptData - Datos del guion
     * @param {Array} imageFiles - Array de archivos binarios (Blob/File)
     */
    async processBinaryImages(cardId, scriptData, imageFiles) {
        console.log('🖼️ Procesando archivos binarios:', imageFiles.length);
        
        // Convertir archivos binarios a URLs de objeto
        const imageObjects = await Promise.all(
            imageFiles.slice(0, 3).map(async (file, index) => {
                const blob = file instanceof Blob ? file : new Blob([file]);
                const imageUrl = URL.createObjectURL(blob);
                
                // Obtener dimensiones de la imagen para determinar formato
                const imageFormat = await this.getImageFormat(imageUrl);
                
                return {
                    id: `image_${cardId}_${index}`,
                    url: imageUrl,
                    blob: blob,
                    format: imageFormat, // 'vertical', 'horizontal', 'square'
                    index: index
                };
            })
        );
        
        // Crear una sola card de escenas con las 3 cápsulas
        const scenesCardData = {
            id: `scenes_card_${cardId}`,
            title: 'Escenas',
            images: imageObjects,
            script_id: cardId, // Guardar ID del guion que generó estas escenas
            type: 'scenes-card'
        };
        
        // Obtener posición del guion que generó estas escenas
        const scriptCard = this.canvas.objects.find(obj => obj.id === cardId);
        const scriptPosition = scriptCard ? { x: scriptCard.x, y: scriptCard.y } : { x: 300, y: 300 };
        
        // Posicionar la card de escenas debajo del guion con offset
        const scenesPosition = {
            x: scriptPosition.x,
            y: scriptPosition.y + 350 // Offset vertical para posicionar debajo
        };
        
        // Crear la card de escenas en el canvas con animación similar a guiones
        setTimeout(() => {
            this.createCanvasObject('scenes-card', scenesCardData, scenesPosition);
            
            // Crear línea de conexión después de que se renderice
            setTimeout(() => {
                this.createConnectionLine(cardId, scenesCardData.id);
                this.fitToContent();
            }, 400);
        }, 200);
        
        this.showNotification(`${imageObjects.length} imágenes de escenas generadas`, 'success');
    }
    
    /**
     * Obtener formato de imagen (vertical, horizontal, cuadrado)
     * @param {string} imageUrl - URL de la imagen
     * @returns {Promise<string>} - 'vertical', 'horizontal', o 'square'
     */
    getImageFormat(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const aspectRatio = img.width / img.height;
                
                if (aspectRatio > 1.1) {
                    resolve('horizontal'); // Ancho > Alto
                } else if (aspectRatio < 0.9) {
                    resolve('vertical'); // Alto > Ancho
                } else {
                    resolve('square'); // Cuadrado
                }
            };
            img.onerror = () => {
                resolve('square'); // Por defecto cuadrado si hay error
            };
            img.src = imageUrl;
        });
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
