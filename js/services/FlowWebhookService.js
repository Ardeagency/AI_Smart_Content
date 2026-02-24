/**
 * FlowWebhookService - Servicio compartido para ejecución y verificación de webhooks de flujos.
 * Usado por StudioView, DevTestView y DevWebhooksView.
 */
(function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 120000;  // 2 minutos
  const DEFAULT_MAX_RETRIES = 3;
  const DEFAULT_RETRY_DELAY_MS = 3000;

  /**
   * Obtiene la URL del webhook según ambiente (test/prod) desde flow o módulo.
   * @param {Object} flowOrModule - Objeto con webhook_url_test y/o webhook_url_prod (o webhook_url legacy)
   * @param {string} environment - 'test' | 'prod'
   * @returns {string|null}
   */
  function getWebhookUrl(flowOrModule, environment) {
    if (!flowOrModule) return null;
    if (environment === 'prod') {
      return flowOrModule.webhook_url_prod || flowOrModule.webhook_url || null;
    }
    return flowOrModule.webhook_url_test || flowOrModule.webhook_url || null;
  }

  /**
   * Limpia un objeto para serialización JSON (elimina undefined, null innecesarios).
   * @param {*} obj
   * @returns {*}
   */
  function cleanJSONObject(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => cleanJSONObject(item)).filter(item => item !== undefined);
    }
    const cleaned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = cleanJSONObject(value);
        }
      }
    }
    return cleaned;
  }

  /**
   * Ejecuta una petición a un webhook con reintentos y timeout configurables.
   * @param {Object} options
   * @param {string} options.url - URL del webhook
   * @param {string} [options.method='POST'] - Método HTTP
   * @param {Object} [options.body] - Cuerpo (se serializa a JSON si es objeto)
   * @param {number} [options.timeoutMs] - Timeout en ms (default 120000)
   * @param {number} [options.maxRetries] - Reintentos máximos (default 3)
   * @param {number} [options.retryDelayMs] - Delay entre reintentos en ms (default 3000)
   * @returns {Promise<{ ok: boolean, status: number, statusText: string, data: any, error?: string }>}
   */
  async function executeWebhook(options) {
    const {
      url,
      method = 'POST',
      body,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxRetries = DEFAULT_MAX_RETRIES,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS
    } = options;

    if (!url) {
      return { ok: false, status: 0, statusText: '', data: null, error: 'URL no configurada' };
    }

    const payload = body != null && typeof body === 'object' ? JSON.stringify(cleanJSONObject(body)) : (typeof body === 'string' ? body : undefined);
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: method === 'GET' ? 'GET' : method,
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json'
          },
          body: method !== 'GET' ? payload : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        lastResponse = response;

        const contentType = response.headers.get('content-type') || '';
        let data = null;
        try {
          const text = await response.text();
          if (text) {
            if (contentType.includes('application/json')) {
              data = JSON.parse(text);
            } else {
              data = text;
            }
          }
        } catch (_) {
          data = null;
        }

        if (response.ok) {
          return { ok: true, status: response.status, statusText: response.statusText, data };
        }

        lastError = data?.message || data?.error || data?.detail || response.statusText || `HTTP ${response.status}`;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelayMs));
        } else {
          return {
            ok: false,
            status: response.status,
            statusText: response.statusText,
            data,
            error: lastError
          };
        }
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err.name === 'AbortError' ? 'Timeout' : (err.message || 'Error de red');
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelayMs));
        } else {
          return {
            ok: false,
            status: lastResponse?.status || 0,
            statusText: lastResponse?.statusText || '',
            data: null,
            error: lastError
          };
        }
      }
    }

    return {
      ok: false,
      status: lastResponse?.status || 0,
      statusText: lastResponse?.statusText || '',
      data: null,
      error: lastError || 'Error desconocido'
    };
  }

  /**
   * Ping liviano a una URL (health check). No usa reintentos.
   * @param {string} url
   * @param {string} [method='POST']
   * @param {number} [timeoutMs=10000]
   * @returns {Promise<{ success: boolean, status?: number, statusText?: string, time: number, error?: string }>}
   */
  async function pingWebhook(url, method = 'POST', timeoutMs = 10000) {
    const start = Date.now();
    if (!url) {
      return { success: false, time: 0, error: 'URL no configurada' };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: method === 'GET' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' ? JSON.stringify({ _ping: true, timestamp: new Date().toISOString() }) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - start;
      return {
        success: response.ok || response.status === 200 || response.status === 201,
        status: response.status,
        statusText: response.statusText,
        time: elapsed
      };
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        success: false,
        time: Date.now() - start,
        error: err.name === 'AbortError' ? 'Timeout' : err.message
      };
    }
  }

  window.FlowWebhookService = {
    getWebhookUrl,
    cleanJSONObject,
    executeWebhook,
    pingWebhook,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_MS
  };
})();
