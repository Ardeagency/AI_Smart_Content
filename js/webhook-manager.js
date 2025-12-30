/**
 * Webhook Manager
 * Maneja todas las comunicaciones con webhooks externos
 */

class WebhookManager {
    constructor() {
        this.webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
        // TODO: Actualizar con la URL real del webhook de escenas
        this.webhookEscenasUrl = 'https://ardeagency.app.n8n.cloud/webhook/ESCENAS_WEBHOOK_URL';
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

    /**
     * Enviar datos al webhook principal
     * @param {Object} data - Datos a enviar
     * @returns {Promise<Object>} - Respuesta del webhook
     */
    async sendDataToWebhook(data) {
        try {
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
            
            console.log('📤 Enviando datos al webhook...');
            console.log('URL:', this.webhookUrl);
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
                    tiene_selec_guion: !!parsedCheck.selec_guion
                });
            } catch (e) {
                console.error('❌ Error al parsear JSON:', e);
                throw new Error('El JSON generado no es válido: ' + e.message);
            }
            
            // Configurar timeout y límite de intentos
            const TIMEOUT_MS = 600000; // 10 minutos por intento
            const MAX_ATTEMPTS = 3; // Máximo 3 intentos
            const RETRY_DELAY_MS = 3000; // 3 segundos entre intentos
            
            console.log(`⏱️ Enviando datos al webhook (máximo ${MAX_ATTEMPTS} intentos, ${TIMEOUT_MS / 1000}s por intento)...`);
            
            let lastError = null;
            
            // Intentar hasta MAX_ATTEMPTS veces
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                console.log(`🔄 Intento ${attempt} de ${MAX_ATTEMPTS}...`);
                
                const startTime = Date.now();
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                try {
                    // Intentar obtener respuesta del webhook
                    const response = await fetch(this.webhookUrl, {
                        method: 'POST',
                        mode: 'cors',
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Accept': 'application/json'
                        },
                        body: jsonBody,
                        signal: controller.signal
                    });
                
                    clearTimeout(timeoutId);
                    
                    // Si tenemos respuesta exitosa, procesarla y retornar
                    if (response && response.ok) {
                        console.log(`✅ Respuesta recibida del webhook en intento ${attempt}`);
                        try {
                            const responseData = await response.json();
                            console.log('📥 Respuesta del webhook (formato):', {
                                es_array: Array.isArray(responseData),
                                cantidad_variantes: Array.isArray(responseData) ? responseData.length : 0,
                                primera_variante: Array.isArray(responseData) && responseData[0] ? {
                                    tiene_variante: !!responseData[0].variante,
                                    tiene_roles: !!responseData[0].roles,
                                    tiene_guion: !!responseData[0].guion,
                                    tiene_promptBase: !!responseData[0].promptBase
                                } : null
                            });
                            console.log('📥 Respuesta completa del webhook:', responseData);
                            
                            return {
                                success: true,
                                data: responseData,
                                message: "Datos recibidos del webhook exitosamente",
                                attempt: attempt
                            };
                        } catch (e) {
                            console.error('❌ Error al parsear respuesta JSON:', e);
                            lastError = new Error('Error al parsear respuesta del webhook: ' + e.message);
                            // Continuar al siguiente intento
                            continue;
                        }
                    } else if (response) {
                        // Respuesta recibida pero no ok - error real del servidor
                        clearTimeout(timeoutId);
                        const errorText = await response.text().catch(() => 'Error desconocido');
                        lastError = new Error(`Webhook respondió con error: ${response.status} - ${errorText}`);
                        console.warn(`⚠️ Intento ${attempt} falló: ${lastError.message}`);
                        
                        // Si es un error 4xx (cliente), no reintentar
                        if (response.status >= 400 && response.status < 500) {
                            throw lastError;
                        }
                        
                        // Para errores 5xx, continuar al siguiente intento
                        if (attempt < MAX_ATTEMPTS) {
                            console.log(`⏳ Esperando ${RETRY_DELAY_MS / 1000}s antes del siguiente intento...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                        }
                        continue;
                    }
                    
                } catch (error) {
                    clearTimeout(timeoutId);
                    lastError = error;
                    
                    // Si es timeout del cliente (real), registrar y continuar
                    if (error.name === 'AbortError') {
                        const elapsed = Date.now() - startTime;
                        console.warn(`⏱️ Intento ${attempt} agotó el tiempo (${(elapsed / 1000).toFixed(0)}s)`);
                        
                        if (attempt < MAX_ATTEMPTS) {
                            console.log(`⏳ Esperando ${RETRY_DELAY_MS / 1000}s antes del siguiente intento...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                        }
                        continue;
                    }

                    // Si es error de red/servidor, registrar y continuar
                    console.warn(`⚠️ Intento ${attempt} falló: ${error.message}`);
                    
                    if (attempt < MAX_ATTEMPTS) {
                        console.log(`⏳ Esperando ${RETRY_DELAY_MS / 1000}s antes del siguiente intento...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                    continue;
                }
            }
            
            // Si llegamos aquí, todos los intentos fallaron
            console.error(`❌ Todos los ${MAX_ATTEMPTS} intentos fallaron`);
            throw new Error(`El webhook no respondió después de ${MAX_ATTEMPTS} intentos. Último error: ${lastError?.message || 'Desconocido'}`);
            
        } catch (error) {
            console.error('Error en webhook:', error);
            throw error;
        }
    }

    /**
     * Enviar datos al webhook de escenas
     * @param {Object} data - Datos a enviar
     * @returns {Promise<Object>} - Respuesta del webhook
     */
    async sendDataToWebhookEscenas(data) {
        try {
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
            
            console.log('📤 Enviando datos al webhook de escenas...');
            console.log('URL:', this.webhookEscenasUrl);
            console.log('Datos:', cleanedData);
            
            // Configurar timeout y límite de intentos
            const TIMEOUT_MS = 600000; // 10 minutos por intento
            const MAX_ATTEMPTS = 3;
            const RETRY_DELAY_MS = 3000;
            
            let lastError = null;
            
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                console.log(`🔄 Intento ${attempt} de ${MAX_ATTEMPTS}...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                try {
                    const response = await fetch(this.webhookEscenasUrl, {
                        method: 'POST',
                        mode: 'cors',
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Accept': 'application/json'
                        },
                        body: jsonBody,
                        signal: controller.signal
                    });
                
                    clearTimeout(timeoutId);
                    
                    if (response && response.ok) {
                        console.log(`✅ Respuesta recibida del webhook de escenas en intento ${attempt}`);
                        try {
                            const responseData = await response.json();
                            console.log('📥 Respuesta del webhook de escenas:', responseData);
                            
                            return {
                                success: true,
                                data: responseData,
                                message: "Escenas recibidas del webhook exitosamente",
                                attempt: attempt
                            };
                        } catch (e) {
                            console.error('❌ Error al parsear respuesta JSON:', e);
                            lastError = new Error('Error al parsear respuesta del webhook: ' + e.message);
                            continue;
                        }
                    } else if (response) {
                        const errorText = await response.text().catch(() => 'Error desconocido');
                        lastError = new Error(`Webhook respondió con error: ${response.status} - ${errorText}`);
                        
                        if (response.status >= 400 && response.status < 500) {
                            throw lastError;
                        }
                        
                        if (attempt < MAX_ATTEMPTS) {
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                        }
                        continue;
                    }
                    
                } catch (error) {
                    clearTimeout(timeoutId);
                    lastError = error;
                    
                    if (error.name === 'AbortError') {
                        console.warn(`⏱️ Intento ${attempt} agotó el tiempo`);
                        if (attempt < MAX_ATTEMPTS) {
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                        }
                        continue;
                    }

                    console.warn(`⚠️ Intento ${attempt} falló: ${error.message}`);
                    if (attempt < MAX_ATTEMPTS) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                    continue;
                }
            }
            
            throw new Error(`El webhook de escenas no respondió después de ${MAX_ATTEMPTS} intentos. Último error: ${lastError?.message || 'Desconocido'}`);
            
        } catch (error) {
            console.error('Error en webhook de escenas:', error);
            throw error;
        }
    }
}

// Exportar para uso global
window.WebhookManager = WebhookManager;
