/**
 * Webhook Manager
 * Maneja todas las comunicaciones con webhooks externos
 */

class WebhookManager {
    constructor() {
        this.webhookUrl = 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702';
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
            
            // Configurar timeout muy largo (10 minutos) para dar tiempo suficiente al webhook
            // Si el servidor tiene timeout antes (como Cloudflare 524), simplemente continuaremos esperando
            const TIMEOUT_MS = 600000; // 10 minutos
            const startTime = Date.now();
            
            console.log(`⏱️ Esperando respuesta del webhook (continuará esperando si hay errores del servidor, hasta ${TIMEOUT_MS / 1000}s)...`);
            
            // Loop continuo hasta que tengamos respuesta exitosa o timeout real del cliente
            while (true) {
                const elapsedTime = Date.now() - startTime;
                const remainingTime = TIMEOUT_MS - elapsedTime;

                if (remainingTime <= 0) {
                    console.error('⏱️ Timeout del cliente: Se agotó el tiempo límite de espera');
                    throw new Error('Timeout: El webhook no respondió después del tiempo límite de espera.');
                }

                // Crear nuevo controller para esta iteración
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), remainingTime);

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
                        console.log('✅ Respuesta recibida del webhook');
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
                                message: "Datos recibidos del webhook exitosamente"
                            };
                        } catch (e) {
                            console.error('❌ Error al parsear respuesta JSON:', e);
                            throw new Error('Error al parsear respuesta del webhook: ' + e.message);
                        }
                    } else if (response) {
                        // Respuesta recibida pero no ok - error real del servidor
                        clearTimeout(timeoutId);
                        const errorText = await response.text().catch(() => 'Error desconocido');
                        throw new Error(`Webhook respondió con error: ${response.status} - ${errorText}`);
                    }
                    
                } catch (error) {
                    clearTimeout(timeoutId);
                    
                    // Si es timeout del cliente (real), lanzar error
                    if (error.name === 'AbortError') {
                        // Verificar si realmente se agotó el tiempo o fue un error del servidor
                        const elapsed = Date.now() - startTime;
                        if (elapsed >= TIMEOUT_MS) {
                            console.error('⏱️ Timeout del cliente: Se agotó el tiempo límite de espera');
                            throw new Error('Timeout: El webhook no respondió después del tiempo límite de espera.');
                        }
                        // Si no, fue un error del servidor que abortó la conexión, continuar esperando
                    }

                    // Si es error de red/servidor (524, ERR_FAILED, CORS, etc.), es un timeout del servidor
                    // NO lanzar error, simplemente continuar esperando
                    const elapsed = Date.now() - startTime;
                    const remaining = TIMEOUT_MS - elapsed;

                    if (remaining <= 0) {
                        // Timeout real alcanzado
                        console.error('⏱️ Timeout del cliente: Se agotó el tiempo límite de espera');
                        throw new Error('Timeout: El webhook no respondió después del tiempo límite de espera.');
                    }

                    console.warn(`⚠️ Error de servidor/red (${error.message}). Tiempo transcurrido: ${(elapsed / 1000).toFixed(0)}s. Tiempo restante: ${(remaining / 1000).toFixed(0)}s. Continuando espera...`);

                    // Esperar un momento antes de continuar el loop
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Continuar el loop para seguir esperando
                    continue;
                }
            }
            
        } catch (error) {
            console.error('Error en webhook:', error);
            throw error;
        }
    }
}

// Exportar para uso global
window.WebhookManager = WebhookManager;
