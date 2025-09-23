/**
 * UGC Studio - Configuration
 * Configuración global para evitar errores en diferentes entornos
 */

// Detectar entorno
const isDevelopment = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('local');

const isNetlify = window.location.hostname.includes('netlify');
const isVercel = window.location.hostname.includes('vercel');
const isProduction = !isDevelopment;

// Configuración global
window.UGC_CONFIG = {
    // Entorno
    environment: isDevelopment ? 'development' : 'production',
    isDevelopment,
    isProduction,
    isNetlify,
    isVercel,
    
    // URLs y endpoints
    baseUrl: window.location.origin,
    
    // Supabase configuración
    supabase: {
        enabled: true,
        url: 'https://ksjeikudvqseoosyhsdd.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTA3NjcsImV4cCI6MjA3Mzg4Njc2N30.WDwu2axnbJ1NZ_0F3keI-uZk7taOt_mUaEGV4EJzEBM',
        serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzamVpa3VkdnFzZW9vc3loc2RkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODMxMDc2NywiZXhwIjoyMDczODg2NzY3fQ.YZPSrRsVklxwyjYdAKd47oB7w4dH4BF7df0MSkbRSp8',
        maxRetries: 3,
        retryDelay: 1000
    },
    
    // Analytics configuración
    analytics: {
        enabled: true,
        flushInterval: 30000, // 30 segundos
        maxEvents: 1000,
        trackErrors: true
    },
    
    // Backend configuración
    backend: {
        offlineFirst: true,
        syncInterval: 30000, // 30 segundos
        maxSyncRetries: 3,
        enableRealtime: true
    },
    
    // Debug configuración
    debug: {
        enabled: isDevelopment,
        logLevel: isDevelopment ? 'debug' : 'error',
        showPerformance: isDevelopment,
        enableConsoleCommands: isDevelopment
    },
    
    // Features flags
    features: {
        supabaseSync: true,
        realTimeUpdates: true,
        offlineMode: true,
        analyticsTracking: true,
        errorReporting: true,
        performanceMonitoring: isDevelopment
    },
    
    // Timeouts y limits
    timeouts: {
        apiRequest: 10000, // 10 segundos
        fileUpload: 30000, // 30 segundos
        syncOperation: 15000, // 15 segundos
        connectionTest: 5000 // 5 segundos
    },
    
    // Error handling
    errorHandling: {
        maxRetries: 3,
        retryDelay: 1000,
        logErrors: true,
        showUserErrors: !isProduction,
        fallbackToLocal: true
    }
};

// Función helper para logging seguro
window.safeLog = function(level, message, data = null) {
    if (!window.UGC_CONFIG.debug.enabled && level === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    try {
        switch (level) {
            case 'debug':
                if (window.UGC_CONFIG.debug.enabled) {
                    console.log(logMessage, data);
                }
                break;
            case 'info':
                console.info(logMessage, data);
                break;
            case 'warn':
                console.warn(logMessage, data);
                break;
            case 'error':
                console.error(logMessage, data);
                if (window.UGC_CONFIG.errorHandling.logErrors && window.analyticsEngine) {
                    try {
                        if (typeof window.analyticsEngine.track === 'function') {
                            window.analyticsEngine.track('error_logged', {
                                message,
                                data,
                                timestamp,
                                url: window.location.href
                            });
                        }
                    } catch (e) {
                        // Ignore analytics errors
                    }
                }
                break;
        }
    } catch (e) {
        // Fallback si console no está disponible
        try {
            window.ugcErrors = window.ugcErrors || [];
            window.ugcErrors.push({ level, message, data, timestamp });
        } catch (e2) {
            // Último recurso
        }
    }
};

// Función helper para manejo de errores seguro
window.safeExecute = async function(fn, fallback = null, context = 'unknown') {
    try {
        return await fn();
    } catch (error) {
        window.safeLog('error', `Error in ${context}:`, error);
        
        if (fallback && typeof fallback === 'function') {
            try {
                return await fallback();
            } catch (fallbackError) {
                window.safeLog('error', `Fallback error in ${context}:`, fallbackError);
            }
        }
        
        return null;
    }
};

// Función para inicializar servicios de forma segura
window.safeInitializeService = async function(serviceName, initFunction, fallback = null) {
    try {
        window.safeLog('debug', `Initializing ${serviceName}...`);
        const result = await initFunction();
        window.safeLog('info', `✅ ${serviceName} initialized successfully`);
        return result;
    } catch (error) {
        window.safeLog('error', `❌ Error initializing ${serviceName}:`, error);
        
        if (fallback && typeof fallback === 'function') {
            try {
                window.safeLog('debug', `Trying fallback for ${serviceName}...`);
                const fallbackResult = await fallback();
                window.safeLog('warn', `⚠️ ${serviceName} initialized with fallback`);
                return fallbackResult;
            } catch (fallbackError) {
                window.safeLog('error', `❌ Fallback failed for ${serviceName}:`, fallbackError);
            }
        }
        
        window.safeLog('warn', `⚠️ ${serviceName} will run with limited functionality`);
        return null;
    }
};

// Función para verificar si un servicio está disponible
window.isServiceAvailable = function(serviceName) {
    const services = {
        supabaseClient: () => window.supabaseClient?.isReady?.(),
        analyticsEngine: () => window.analyticsEngine && typeof window.analyticsEngine.track === 'function',
        localDatabase: () => window.localDatabase?.isReady?.(),
        dataCollector: () => window.dataCollector?.isInitialized,
        backendIntegrator: () => window.backendIntegrator?.isInitialized
    };
    
    const check = services[serviceName];
    return check ? check() : false;
};

// Configurar manejo global de errores
window.addEventListener('error', (event) => {
    window.safeLog('error', 'Global error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
});

window.addEventListener('unhandledrejection', (event) => {
    window.safeLog('error', 'Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise
    });
});

// Configurar timeout global para funciones async
const originalSetTimeout = window.setTimeout;
window.safeTimeout = function(fn, delay, context = 'timeout') {
    return originalSetTimeout(() => {
        window.safeExecute(fn, null, context);
    }, delay);
};

// Helper para detectar capacidades del navegador
window.browserCapabilities = {
    indexedDB: typeof window.indexedDB !== 'undefined',
    localStorage: typeof window.localStorage !== 'undefined',
    sessionStorage: typeof window.sessionStorage !== 'undefined',
    serviceWorker: 'serviceWorker' in navigator,
    webWorker: typeof Worker !== 'undefined',
    fetch: typeof window.fetch !== 'undefined',
    promises: typeof Promise !== 'undefined',
    asyncAwait: (function() {
        try {
            eval('(async function() {})');
            return true;
        } catch (e) {
            return false;
        }
    })()
};

// Log de inicialización
window.safeLog('info', 'UGC Config initialized', {
    environment: window.UGC_CONFIG.environment,
    capabilities: window.browserCapabilities,
    hostname: window.location.hostname
});

console.log('🔧 UGC Config loaded successfully');
