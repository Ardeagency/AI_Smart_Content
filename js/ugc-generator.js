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
            // Mostrar estado de carga en el output container
            this.showLoadingState();
            
            // Recolectar todos los datos
            console.log('📦 Recolectando datos del sidebar...');
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Validar datos requeridos
            if (!this.dataCollector.validateRequiredData(allData)) {
                this.showNotification('Faltan datos requeridos. Por favor completa marca, producto, género y edad.', 'error');
                this.hideLoadingState();
                return;
            }
            
            console.log('📤 Enviando datos al webhook (puede tardar hasta 5 minutos)...');
            // Enviar datos al webhook y esperar respuesta (timeout de 5 minutos)
            const result = await this.webhookManager.sendDataToWebhook(allData);
            
            console.log('✅ Respuesta del webhook recibida:', result);
            
            // Ocultar estado de carga
            this.hideLoadingState();
            
            // Procesar la respuesta del webhook si existe
            if (result && result.success && result.data) {
                const variants = result.data;
                if (Array.isArray(variants) && variants.length > 0) {
                    console.log(`📝 Procesando ${variants.length} variante(s) de guiones...`);
                    this.displayOutputs(variants);
                    this.showNotification(`✅ ${variants.length} guión(es) generado(s) exitosamente`, 'success');
                } else {
                    console.warn('⚠️ Respuesta del webhook no contiene variantes válidas');
                    this.showNotification('⚠️ El webhook respondió pero sin datos válidos', 'error');
                }
            } else {
                // Si no hay respuesta de datos (modo no-cors), mostrar mensaje
                this.showNotification('✅ Datos enviados al servidor (procesando...)', 'info');
            }
            
        } catch (error) {
            // Ocultar estado de carga en caso de error
            this.hideLoadingState();
            console.error('Error generando UGC:', error);
            this.showNotification('Error al procesar: ' + error.message, 'error');
        }
    }

    /**
     * Mostrar estado de carga en el output container
     */
    showLoadingState() {
        const outputContainer = document.querySelector('.output-container');
        if (outputContainer) {
            outputContainer.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Generando contenido...</p>
                </div>
            `;
        }
    }

    /**
     * Ocultar estado de carga
     */
    hideLoadingState() {
        const outputContainer = document.querySelector('.output-container');
        if (outputContainer && outputContainer.querySelector('.loading-state')) {
            outputContainer.innerHTML = '';
        }
    }

    /**
     * Mostrar outputs en el contenedor
     * @param {Array} variants - Array de variantes de guiones
     */
    displayOutputs(variants) {
        const outputContainer = document.querySelector('.output-container');
        if (!outputContainer) return;

        // Limpiar contenedor
        outputContainer.innerHTML = '';

        // Crear cards para cada variante
        variants.forEach((variant, index) => {
            const outputCard = document.createElement('div');
            outputCard.className = 'output-card';
            outputCard.innerHTML = `
                <div class="output-card-header">
                    <h3>Variante ${index + 1}</h3>
                </div>
                <div class="output-card-content">
                    <pre>${JSON.stringify(variant, null, 2)}</pre>
                </div>
            `;
            outputContainer.appendChild(outputCard);
        });
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
