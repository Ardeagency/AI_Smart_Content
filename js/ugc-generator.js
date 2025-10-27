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
            // Mostrar animación de carga silenciosamente
            if (this.canvasManagerRef) {
                this.canvasManagerRef.showLoadingAnimation();
            }
            
            // Recolectar todos los datos
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Validar datos requeridos
            if (!this.dataCollector.validateRequiredData(allData)) {
                this.showNotification('Faltan datos requeridos. Por favor completa marca, producto, género y edad.', 'error');
                if (this.canvasManagerRef) {
                    this.canvasManagerRef.hideLoadingAnimation();
                }
                return;
            }
            
            // Enviar datos al webhook y esperar respuesta
            const result = await this.webhookManager.sendDataToWebhook(allData);
            
            console.log('✅ Datos enviados al webhook correctamente:', result);
            this.showNotification('✅ Datos enviados exitosamente al servidor', 'success');
            
            // Para webhooks con no-cors, no hay respuesta real
            // Procesar respuesta mock para mostrar en canvas
            if (this.canvasManagerRef) {
                // Limpiar animación de carga
                this.canvasManagerRef.hideLoadingAnimation();
                
                // Mostrar mensaje de éxito en canvas
                this.canvasManagerRef.clearCanvas();
                console.log('✅ Webhook procesado correctamente');
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
