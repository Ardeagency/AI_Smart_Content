/**
 * Output Generator
 * Maneja la generación de múltiples formatos de contenido y la comunicación entre componentes
 */

class OutputGenerator {
    constructor(dataCollector, webhookManager) {
        this.dataCollector = dataCollector;
        this.webhookManager = webhookManager;
        this.currentVariantes = []; // Guardar las variantes actuales
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
            if (result && result.success) {
                // La respuesta puede venir en result.data o directamente en result
                const outputs = result.data || result;
                
                console.log('📥 Respuesta del webhook recibida:', result);
                console.log('📥 outputs extraído:', outputs);
                console.log('📥 Es array?:', Array.isArray(outputs));
                console.log('📥 Longitud:', Array.isArray(outputs) ? outputs.length : 'N/A');
                
                // Validar que sea un array válido con contenido
                if (Array.isArray(outputs) && outputs.length > 0) {
                    console.log(`📝 Procesando ${outputs.length} variante(s) de guión...`);
                    this.displayOutputs(outputs);
                    this.showNotification(`✅ ${outputs.length} variante(s) de guión generada(s) exitosamente`, 'success');
                } else if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
                    // Si es un objeto único, convertirlo a array
                    console.log('📝 Procesando guión único (convertido a array)...');
                    this.displayOutputs([outputs]);
                    this.showNotification('✅ Guión generado exitosamente', 'success');
                } else {
                    console.warn('⚠️ Respuesta del webhook no contiene outputs válidos:', outputs);
                    console.warn('⚠️ Tipo:', typeof outputs);
                    console.warn('⚠️ Es array?:', Array.isArray(outputs));
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
     * @param {Array} outputs - Array de outputs de contenido (variantes de guión)
     */
    displayOutputs(outputs) {
        const outputContainer = document.querySelector('.output-container');
        if (!outputContainer) {
            console.error('❌ No se encontró el contenedor .output-container');
            return;
        }

        console.log('📦 displayOutputs llamado con:', outputs);
        console.log('📦 Cantidad de variantes:', Array.isArray(outputs) ? outputs.length : 'No es array');

        // Limpiar contenedor
        outputContainer.innerHTML = '';

        // Guardar las variantes actuales
        this.currentVariantes = outputs;
        
        // Validar que outputs sea un array
        if (!Array.isArray(outputs)) {
            console.error('❌ outputs no es un array:', outputs);
            return;
        }
        
        console.log(`✅ Creando ${outputs.length} card(s) de guión...`);
        
        // Crear cards para cada variante de guión
        outputs.forEach((variante, index) => {
            console.log(`📝 Procesando variante ${index + 1}:`, variante);
            const outputCard = document.createElement('div');
            outputCard.className = 'output-card';
            
            // Extraer información de la variante
            const varianteNum = variante.variante || (index + 1);
            const roles = variante.roles || [];
            const guion = variante.guion || {};
            const promptBase = variante.promptBase || {};
            
            // Construir HTML para mostrar el guión
            let clipsHTML = '';
            if (guion.clips && Array.isArray(guion.clips)) {
                clipsHTML = guion.clips.map((clip, clipIndex) => `
                    <div class="clip-item">
                        <div class="clip-header">
                            <span class="clip-role">${clip.role || 'Sin rol'}</span>
                            <span class="clip-duration">${clip.dur || 0}s</span>
                        </div>
                        <div class="clip-content">
                            <div class="clip-scene">
                                <strong>Escena:</strong> ${clip.scene_prompt || 'Sin descripción'}
                            </div>
                            <div class="clip-voice">
                                <strong>Voice Over:</strong> "${clip.voice_over || 'Sin texto'}"
                            </div>
                            ${clip.notes ? `
                            <div class="clip-notes">
                                <strong>Notas técnicas:</strong>
                                <ul>
                                    ${clip.notes.camera ? `<li><strong>Cámara:</strong> ${clip.notes.camera}</li>` : ''}
                                    ${clip.notes.lighting ? `<li><strong>Iluminación:</strong> ${clip.notes.lighting}</li>` : ''}
                                    ${clip.notes.sound ? `<li><strong>Sonido:</strong> ${clip.notes.sound}</li>` : ''}
                                    ${clip.notes.imperfection ? `<li><strong>Imperfección:</strong> ${clip.notes.imperfection}</li>` : ''}
                                    ${clip.notes.continuity ? `<li><strong>Continuidad:</strong> ${clip.notes.continuity}</li>` : ''}
                                </ul>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
            }
            
            outputCard.innerHTML = `
                <div class="output-card-header">
                    <h3>Variante ${varianteNum}</h3>
                    <div class="output-roles">
                        ${roles.map(role => `<span class="role-badge">${role}</span>`).join('')}
                    </div>
                </div>
                <div class="output-card-content">
                    ${guion.context ? `
                    <div class="guion-context">
                        <h4>Contexto</h4>
                        <div class="context-details">
                            ${guion.context.place ? `<p><strong>Lugar:</strong> ${guion.context.place}</p>` : ''}
                            ${guion.context.time ? `<p><strong>Tiempo:</strong> ${guion.context.time}</p>` : ''}
                            ${guion.context.why_now ? `<p><strong>Por qué ahora:</strong> ${guion.context.why_now}</p>` : ''}
                            ${guion.context.subject_profile ? `<p><strong>Perfil del sujeto:</strong> ${guion.context.subject_profile}</p>` : ''}
                            ${guion.context.subject_voice ? `<p><strong>Voz del sujeto:</strong> ${guion.context.subject_voice}</p>` : ''}
                            ${guion.context.props && Array.isArray(guion.context.props) ? `
                                <p><strong>Props:</strong> ${guion.context.props.join(', ')}</p>
                            ` : ''}
                            ${guion.context.continuity ? `<p><strong>Continuidad:</strong> ${guion.context.continuity}</p>` : ''}
                        </div>
                    </div>
                    ` : ''}
                    ${clipsHTML ? `
                    <div class="guion-clips">
                        <h4>Clips del Guión</h4>
                        ${clipsHTML}
                    </div>
                    ` : ''}
                    ${promptBase.guion ? `
                    <div class="guion-prompt">
                        <h4>Prompt Base</h4>
                        <div class="prompt-content">
                            <pre>${promptBase.guion}</pre>
                        </div>
                    </div>
                    ` : ''}
                    <div class="guion-actions">
                        <div class="guion-feedback">
                            <label for="feedback-${varianteNum}">Indicaciones para reajustar este guion:</label>
                            <textarea 
                                id="feedback-${varianteNum}" 
                                class="guion-feedback-input" 
                                placeholder="Ej: Cambiar el tono a más profesional, agregar más énfasis en los beneficios, etc."
                                rows="3"></textarea>
                        </div>
                        <div class="guion-buttons">
                            <button 
                                class="btn-reajustar" 
                                onclick="window.outputGenerator.reajustarGuion(${varianteNum}, ${index})"
                                data-variante-index="${index}">
                                <i class="fas fa-edit"></i>
                                Reajustar este guion
                            </button>
                            <button 
                                class="btn-generar-escenas" 
                                onclick="window.outputGenerator.generarEscenas(${varianteNum}, ${index})"
                                data-variante-index="${index}">
                                <i class="fas fa-video"></i>
                                Generar escenas
                            </button>
                        </div>
                    </div>
                </div>
            `;
            // Guardar la variante completa en el elemento para acceso posterior
            outputCard.dataset.varianteData = JSON.stringify(variante);
            outputCard.dataset.varianteIndex = index;
            outputContainer.appendChild(outputCard);
            console.log(`✅ Card ${index + 1} (Variante ${varianteNum}) agregada al contenedor`);
        });
        
        console.log(`✅ Total de cards en el contenedor: ${outputContainer.children.length}`);
        console.log('📦 Contenedor final:', outputContainer);
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

    /**
     * Reajustar un guion específico con indicaciones del usuario
     * @param {number} varianteNum - Número de la variante
     * @param {number} varianteIndex - Índice de la variante en el array
     */
    async reajustarGuion(varianteNum, varianteIndex) {
        try {
            // Obtener las indicaciones del usuario
            const feedbackInput = document.getElementById(`feedback-${varianteNum}`);
            const indicaciones = feedbackInput ? feedbackInput.value.trim() : '';
            
            if (!indicaciones) {
                this.showNotification('Por favor, ingresa indicaciones para reajustar el guion.', 'warning');
                return;
            }

            // Obtener la variante original
            const varianteOriginal = this.currentVariantes[varianteIndex];
            if (!varianteOriginal) {
                this.showNotification('Error: No se encontró la variante seleccionada.', 'error');
                return;
            }

            // Mostrar estado de carga
            this.showLoadingState();
            this.showNotification('Reajustando guion...', 'info');

            // Recolectar todos los datos originales
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Agregar las indicaciones y la variante a reajustar
            const dataConIndicaciones = {
                ...allData,
                reajustar_guion: {
                    variante: varianteOriginal,
                    indicaciones: indicaciones
                }
            };

            // Enviar al mismo webhook
            const result = await this.webhookManager.sendDataToWebhook(dataConIndicaciones);
            
            this.hideLoadingState();

            // Procesar la respuesta
            if (result && result.success) {
                const outputs = result.data || result;
                if (Array.isArray(outputs) && outputs.length > 0) {
                    this.displayOutputs(outputs);
                    this.showNotification('✅ Guion reajustado exitosamente', 'success');
                } else {
                    this.showNotification('⚠️ El webhook respondió pero sin datos válidos', 'error');
                }
            } else {
                this.showNotification('Error al reajustar el guion', 'error');
            }

        } catch (error) {
            this.hideLoadingState();
            console.error('Error reajustando guion:', error);
            this.showNotification('Error al procesar: ' + error.message, 'error');
        }
    }

    /**
     * Generar escenas para un guion específico
     * @param {number} varianteNum - Número de la variante
     * @param {number} varianteIndex - Índice de la variante en el array
     */
    async generarEscenas(varianteNum, varianteIndex) {
        try {
            // Obtener la variante original
            const varianteOriginal = this.currentVariantes[varianteIndex];
            if (!varianteOriginal) {
                this.showNotification('Error: No se encontró la variante seleccionada.', 'error');
                return;
            }

            // Mostrar estado de carga
            this.showLoadingState();
            this.showNotification('Generando escenas...', 'info');

            // Recolectar todos los datos originales
            const allData = await this.dataCollector.collectAllSidebarData();
            
            // Agregar el guion para generar escenas
            const dataParaEscenas = {
                ...allData,
                guion_para_escenas: varianteOriginal
            };

            // Enviar al webhook de escenas
            const result = await this.webhookManager.sendDataToWebhookEscenas(dataParaEscenas);
            
            this.hideLoadingState();

            // Procesar la respuesta (puede ser diferente formato)
            if (result && result.success) {
                const escenas = result.data || result;
                // Aquí puedes mostrar las escenas generadas de la forma que necesites
                console.log('Escenas generadas:', escenas);
                this.showNotification('✅ Escenas generadas exitosamente', 'success');
                // TODO: Implementar visualización de escenas
            } else {
                this.showNotification('⚠️ Error al generar escenas', 'error');
            }

        } catch (error) {
            this.hideLoadingState();
            console.error('Error generando escenas:', error);
            this.showNotification('Error al procesar: ' + error.message, 'error');
        }
    }
}

// Exportar para uso global
window.OutputGenerator = OutputGenerator;

