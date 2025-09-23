/**
 * Analytics Throttle - Sistema de Control de Eventos
 * Previene spam de eventos y optimiza la recolección de datos
 */

class AnalyticsThrottle {
    constructor() {
        this.eventLimits = new Map();
        this.throttleConfig = {
            // Configuración más agresiva para eliminar spam
            frame_rate: { maxPerSecond: 0, maxTotal: 0 }, // COMPLETAMENTE DESHABILITADO
            memory_usage: { maxPerSecond: 0, maxTotal: 0 }, // COMPLETAMENTE DESHABILITADO
            analytics_processed: { maxPerSecond: 0, maxTotal: 0 }, // COMPLETAMENTE DESHABILITADO
            active_time: { maxPerSecond: 0.1, maxTotal: 5 }, // Muy limitado
            window_blur: { maxPerSecond: 0.1, maxTotal: 3 },
            scroll: { maxPerSecond: 0.5, maxTotal: 10 },
            click: { maxPerSecond: 2, maxTotal: 50 },
            input: { maxPerSecond: 0.5, maxTotal: 20 },
            page_view: { maxPerSecond: 0.1, maxTotal: 5 },
            form_step: { maxPerSecond: 0.5, maxTotal: 33 },
            user_action: { maxPerSecond: 1, maxTotal: 25 }
        };
        
        this.eventCounts = new Map();
        this.lastEventTimes = new Map();
        this.blockedEvents = new Set();
        
        // Reset contadores cada minuto
        setInterval(() => this.resetCounters(), 60000);
        
        console.log('🛡️ Analytics Throttle initialized');
    }

    shouldAllowEvent(eventType, data = {}) {
        const now = Date.now();
        const config = this.throttleConfig[eventType];
        
        if (!config) {
            // Permitir eventos no configurados con límite básico
            return this.checkBasicLimit(eventType, now);
        }

        const eventKey = this.getEventKey(eventType, data);
        const currentCount = this.eventCounts.get(eventKey) || 0;
        const lastTime = this.lastEventTimes.get(eventKey) || 0;
        
        // Verificar límite por segundo
        const timeDiff = now - lastTime;
        if (timeDiff < (1000 / config.maxPerSecond)) {
            this.logThrottled(eventType, 'rate_limit');
            return false;
        }
        
        // Verificar límite total
        if (currentCount >= config.maxTotal) {
            this.logThrottled(eventType, 'total_limit');
            return false;
        }
        
        // Actualizar contadores
        this.eventCounts.set(eventKey, currentCount + 1);
        this.lastEventTimes.set(eventKey, now);
        
        return true;
    }

    checkBasicLimit(eventType, now) {
        const eventKey = `basic_${eventType}`;
        const lastTime = this.lastEventTimes.get(eventKey) || 0;
        
        // Límite básico: 1 evento por segundo
        if (now - lastTime < 1000) {
            this.logThrottled(eventType, 'basic_limit');
            return false;
        }
        
        this.lastEventTimes.set(eventKey, now);
        return true;
    }

    getEventKey(eventType, data) {
        // Crear clave única basada en tipo y contexto
        switch (eventType) {
            case 'form_step':
                return `${eventType}_${data.step || 'unknown'}`;
            case 'page_view':
                return `${eventType}_${data.page || 'unknown'}`;
            default:
                return eventType;
        }
    }

    logThrottled(eventType, reason) {
        if (!this.blockedEvents.has(eventType)) {
            console.warn(`🛡️ Throttling ${eventType} events (${reason})`);
            this.blockedEvents.add(eventType);
            
            // Limpiar log después de 30 segundos
            setTimeout(() => {
                this.blockedEvents.delete(eventType);
            }, 30000);
        }
    }

    resetCounters() {
        // Reset parcial cada minuto
        for (const [key, count] of this.eventCounts) {
            if (count > 0) {
                this.eventCounts.set(key, Math.floor(count * 0.5));
            }
        }
        
        console.log('🛡️ Analytics counters reset');
    }

    getThrottleStats() {
        return {
            eventCounts: Object.fromEntries(this.eventCounts),
            lastEventTimes: Object.fromEntries(this.lastEventTimes),
            blockedEventsCount: this.blockedEvents.size,
            config: this.throttleConfig
        };
    }

    updateConfig(eventType, config) {
        this.throttleConfig[eventType] = { ...this.throttleConfig[eventType], ...config };
        console.log(`🛡️ Updated throttle config for ${eventType}:`, this.throttleConfig[eventType]);
    }

    // Método para permitir eventos críticos sin throttling
    allowCriticalEvent(eventType) {
        const criticalEvents = ['error', 'user_created', 'form_completed', 'payment_processed'];
        return criticalEvents.includes(eventType);
    }
}

// Wrapper para analytics que incluye throttling
class ThrottledAnalytics {
    constructor() {
        this.throttle = new AnalyticsThrottle();
        this.originalTrack = null;
        this.queuedEvents = [];
        this.init();
    }

    init() {
        // Esperar a que analytics esté listo
        const checkAnalytics = () => {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                this.setupThrottling();
            } else {
                setTimeout(checkAnalytics, 100);
            }
        };
        checkAnalytics();
    }

    setupThrottling() {
        // Guardar método original
        this.originalTrack = window.analyticsEngine.track.bind(window.analyticsEngine);
        
        // Reemplazar con versión throttled
        window.analyticsEngine.track = (eventType, data = {}) => {
            return this.throttledTrack(eventType, data);
        };
        
        console.log('🛡️ Analytics throttling enabled');
    }

    throttledTrack(eventType, data = {}) {
        // Permitir eventos críticos sin throttling
        if (this.throttle.allowCriticalEvent(eventType) || this.throttle.shouldAllowEvent(eventType, data)) {
            if (this.originalTrack) {
                return this.originalTrack(eventType, data);
            } else {
                // Encolar si analytics no está listo
                this.queuedEvents.push({ eventType, data, timestamp: Date.now() });
            }
        }
        // Eventos throttled se ignoran silenciosamente
    }

    // Procesar eventos encolados
    processQueuedEvents() {
        if (this.originalTrack && this.queuedEvents.length > 0) {
            const events = this.queuedEvents.splice(0);
            events.forEach(({ eventType, data }) => {
                this.originalTrack(eventType, data);
            });
            console.log(`🛡️ Processed ${events.length} queued events`);
        }
    }

    getStats() {
        return {
            throttle: this.throttle.getThrottleStats(),
            queuedEvents: this.queuedEvents.length
        };
    }
}

// Inicializar throttling global
window.throttledAnalytics = new ThrottledAnalytics();

// Función global para obtener estadísticas de throttling
window.getAnalyticsThrottleStats = () => {
    return window.throttledAnalytics?.getStats() || {};
};

console.log('🛡️ Analytics Throttle module loaded');
