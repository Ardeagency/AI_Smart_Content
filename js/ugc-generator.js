/**
 * UGC Generator
 * Maneja la generación de UGC y la comunicación entre componentes
 */

class UGCGenerator {
    constructor(dataCollector, webhookManager, canvasManager) {
        this.dataCollector = dataCollector;
        this.webhookManager = webhookManager;
        this.canvasManager = canvasManager || null;
    }

    /**
     * Obtener canvasManager de forma dinámica
     * @returns {CanvasManager|null} - Referencia al canvasManager
     */
    get canvasManagerRef() {
        // Intentar obtener de window si no está disponible localmente
        if (!this.canvasManager && window.canvasManager) {
            this.canvasManager = window.canvasManager;
        }
        return this.canvasManager;
    }

    /**
     * Generar UGC completo
     * @returns {Promise<void>}
     */
    async generateUGC() {
        try {
            // Mostrar animación de carga INMEDIATAMENTE
            if (this.canvasManagerRef) {
                console.log('🎬 Mostrando animación de carga...');
                this.canvasManagerRef.showLoadingAnimation();
                // Verificar que la animación se mostró
                setTimeout(() => {
                    const loadingCards = this.canvasManagerRef?.canvas?.loadingCards || [];
                    console.log(`📊 Estado animación: ${loadingCards.length} cards de carga visibles`);
                }, 100);
            } else {
                console.warn('⚠️ CanvasManager no disponible, no se puede mostrar animación');
            }
            
            // Recolectar todos los datos
            console.log('📦 Recolectando datos del sidebar...');
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Validar datos requeridos
            if (!this.dataCollector.validateRequiredData(allData)) {
                this.showNotification('Faltan datos requeridos. Por favor completa marca, producto, género y edad.', 'error');
                if (this.canvasManagerRef) {
                    this.canvasManagerRef.hideLoadingAnimation();
                }
                return;
            }
            
            console.log('📤 Enviando datos al webhook (puede tardar hasta 5 minutos, manteniendo animación visible)...');
            // Enviar datos al webhook y esperar respuesta (timeout de 5 minutos)
            // La animación de carga permanecerá visible durante toda la espera
            const result = await this.webhookManager.sendDataToWebhook(allData);
            
            console.log('✅ Respuesta del webhook recibida:', result);
            
            // Procesar la respuesta del webhook si existe
            if (this.canvasManagerRef) {
                // Limpiar animación de carga SOLO después de recibir la respuesta
                console.log('🎬 Ocultando animación de carga...');
                this.canvasManagerRef.hideLoadingAnimation();
                
                // Si hay datos en la respuesta, procesarlos
                if (result && result.success && result.data) {
                    const variants = result.data;
                    if (Array.isArray(variants) && variants.length > 0) {
                        console.log(`📝 Procesando ${variants.length} variante(s) de guiones...`);
                        this.canvasManagerRef.processVariantsResponse(variants);
                        this.showNotification(`✅ ${variants.length} guión(es) generado(s) exitosamente`, 'success');
                    } else {
                        console.warn('⚠️ Respuesta del webhook no contiene variantes válidas');
                        this.showNotification('⚠️ El webhook respondió pero sin datos válidos', 'error');
                    }
                } else {
                    // Si no hay respuesta de datos (modo no-cors), mostrar mensaje
                    this.canvasManagerRef.clearCanvas();
                    this.showNotification('✅ Datos enviados al servidor (procesando...)', 'info');
                }
            }
            
        } catch (error) {
            // Ocultar animación en caso de error
            if (this.canvasManagerRef) {
                this.canvasManagerRef.hideLoadingAnimation();
            }
            console.error('Error generando UGC:', error);
            this.showNotification('Error al procesar: ' + error.message, 'error');
        }
    }

    /**
     * Mostrar notificación
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo de notificación (success, error, info)
     */
    showNotification(message, type = 'info') {
        // Implementar sistema de notificaciones
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Exportar para uso global
window.UGCGenerator = UGCGenerator;
