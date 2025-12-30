/**
 * Output Generator
 * Maneja la generación de múltiples formatos de contenido y la comunicación entre componentes
 */

class OutputGenerator {
    constructor(dataCollector, webhookManager) {
        this.dataCollector = dataCollector;
        this.webhookManager = webhookManager;
    }

    /**
     * Generar contenido completo
     * @returns {Promise<void>}
     */
    async generateContent() {
        try {
            // Mostrar estado de carga en el output container
            this.showLoadingState();
            
            // Recolectar todos los datos
            console.log('📦 Recolectando datos del sidebar...');
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Validar datos requeridos
            const validation = this.dataCollector.validateRequiredData(allData);
            if (!validation.valid) {
                this.showNotification(validation.message || 'Faltan datos requeridos. Por favor completa la información necesaria.', 'error');
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
                const outputs = result.data;
                if (Array.isArray(outputs) && outputs.length > 0) {
                    console.log(`📝 Procesando ${outputs.length} output(s) de contenido...`);
                    this.displayOutputs(outputs);
                    this.showNotification(`✅ ${outputs.length} formato(s) de contenido generado(s) exitosamente`, 'success');
                } else {
                    console.warn('⚠️ Respuesta del webhook no contiene outputs válidos');
                    this.showNotification('⚠️ El webhook respondió pero sin datos válidos', 'error');
                }
            } else {
                // Si no hay respuesta de datos (modo no-cors), mostrar mensaje
                this.showNotification('✅ Datos enviados al servidor (procesando...)', 'info');
            }
            
        } catch (error) {
            // Ocultar estado de carga en caso de error
            this.hideLoadingState();
            console.error('Error generando contenido:', error);
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
     * @param {Array} outputs - Array de outputs de contenido
     */
    displayOutputs(outputs) {
        const outputContainer = document.querySelector('.output-container');
        if (!outputContainer) return;

        // Limpiar contenedor
        outputContainer.innerHTML = '';

        // Crear cards para cada output
        outputs.forEach((output, index) => {
            const outputCard = document.createElement('div');
            outputCard.className = 'output-card';
            
            // Determinar el tipo de contenido y mostrar apropiadamente
            const contentType = output.type || 'unknown';
            const contentTitle = output.title || `Output ${index + 1}`;
            
            outputCard.innerHTML = `
                <div class="output-card-header">
                    <h3>${contentTitle}</h3>
                    <span class="output-type-badge">${contentType}</span>
                </div>
                <div class="output-card-content">
                    <pre>${JSON.stringify(output, null, 2)}</pre>
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
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Crear notificación visual
        const notification = document.createElement('div');
        notification.className = `studio-notification studio-notification-${type}`;
        
        // Icono según tipo
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        else if (type === 'error') icon = 'fa-exclamation-triangle';
        else if (type === 'warning') icon = 'fa-exclamation-circle';
        
        notification.innerHTML = `
            <div class="studio-notification-content">
                <i class="fas ${icon} studio-notification-icon"></i>
                <span class="studio-notification-message">${message}</span>
            </div>
            <button class="studio-notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Agregar al body
        document.body.appendChild(notification);
        
        // Mostrar con animación
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Auto-ocultar después de 5 segundos (o 8 segundos para errores)
        const duration = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }, duration);
        
        // Si es error, también mostrar en el contenedor de output
        if (type === 'error') {
            const outputContainer = document.querySelector('.output-container');
            if (outputContainer) {
                outputContainer.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3>Error de validación</h3>
                        <p>${message}</p>
                        <div class="error-hint">
                            <i class="fas fa-info-circle"></i>
                            <span>Por favor, completa la información requerida antes de generar contenido.</span>
                        </div>
                    </div>
                `;
            }
        }
    }
}

// Exportar para uso global
window.OutputGenerator = OutputGenerator;

