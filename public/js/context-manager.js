// ===== SISTEMA DE CONTEXTO GLOBAL SERVERLESS =====
// Gestión de estado, persistencia y sincronización entre formularios

class ContextManager {
    constructor() {
        this.context = {
            user: null,
            brand: null,
            product: null,
            preferences: null,
            session: {
                id: this.generateSessionId(),
                startTime: Date.now(),
                device: this.getDeviceInfo(),
                browser: this.getBrowserInfo(),
                location: null
            },
            navigation: {
                currentStep: 1,
                totalSteps: 4,
                completedSteps: [],
                lastStep: null
            },
            errors: [],
            warnings: []
        };
        
        this.storageKey = 'ugc_studio_context';
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.setupEventListeners();
        this.detectLocation();
        this.trackNavigation();
    }

    // ===== GESTIÓN DE SESIÓN =====
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getDeviceInfo() {
        const ua = navigator.userAgent;
        return {
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
            isTablet: /iPad|Android/i.test(ua) && !/Mobile/i.test(ua),
            isDesktop: !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
            os: this.getOS(ua),
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    getBrowserInfo() {
        const ua = navigator.userAgent;
        return {
            name: this.getBrowserName(ua),
            version: this.getBrowserVersion(ua),
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine
        };
    }

    getOS(userAgent) {
        if (userAgent.indexOf('Win') !== -1) return 'Windows';
        if (userAgent.indexOf('Mac') !== -1) return 'MacOS';
        if (userAgent.indexOf('Linux') !== -1) return 'Linux';
        if (userAgent.indexOf('Android') !== -1) return 'Android';
        if (userAgent.indexOf('iOS') !== -1) return 'iOS';
        return 'Unknown';
    }

    getBrowserName(userAgent) {
        if (userAgent.indexOf('Chrome') !== -1) return 'Chrome';
        if (userAgent.indexOf('Firefox') !== -1) return 'Firefox';
        if (userAgent.indexOf('Safari') !== -1) return 'Safari';
        if (userAgent.indexOf('Edge') !== -1) return 'Edge';
        if (userAgent.indexOf('Opera') !== -1) return 'Opera';
        return 'Unknown';
    }

    getBrowserVersion(userAgent) {
        const match = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+\.\d+)/);
        return match ? match[2] : 'Unknown';
    }

    // ===== DETECCIÓN DE UBICACIÓN =====
    async detectLocation() {
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                        enableHighAccuracy: false
                    });
                });
                
                this.context.session.location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
            } catch (error) {
                console.warn('Geolocation not available:', error.message);
                this.context.session.location = null;
            }
        }
    }

    // ===== GESTIÓN DE NAVEGACIÓN =====
    trackNavigation() {
        const currentPage = this.getCurrentPage();
        this.context.navigation.currentStep = this.getStepFromPage(currentPage);
        this.context.navigation.lastStep = currentPage;
        
        // Marcar paso como visitado
        if (!this.context.navigation.completedSteps.includes(currentPage)) {
            this.context.navigation.completedSteps.push(currentPage);
        }
        
        this.saveToStorage();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('datos-preferencias')) return 'preferences';
        if (path.includes('datos-productos')) return 'products';
        if (path.includes('datos-marca')) return 'brand';
        if (path.includes('datos-usuario')) return 'user';
        if (path.includes('login')) return 'login';
        return 'landing';
    }

    getStepFromPage(page) {
        const stepMap = {
            'landing': 0,
            'preferences': 1,
            'products': 2,
            'brand': 3,
            'user': 4,
            'login': 5
        };
        return stepMap[page] || 0;
    }

    // ===== GESTIÓN DE DATOS =====
    setData(type, data) {
        this.context[type] = data;
        this.saveToStorage();
        this.emit('dataChanged', { type, data });
    }

    getData(type) {
        return this.context[type];
    }

    updateData(type, updates) {
        if (this.context[type]) {
            this.context[type] = { ...this.context[type], ...updates };
        } else {
            this.context[type] = updates;
        }
        this.saveToStorage();
        this.emit('dataChanged', { type, data: this.context[type] });
    }

    // ===== GESTIÓN DE ERRORES =====
    addError(error) {
        const errorObj = {
            id: Date.now(),
            message: error.message || error,
            type: error.type || 'error',
            timestamp: Date.now(),
            page: this.getCurrentPage(),
            stack: error.stack
        };
        
        this.context.errors.push(errorObj);
        this.saveToStorage();
        this.emit('errorAdded', errorObj);
        
        // Auto-remove after 30 seconds
        setTimeout(() => {
            this.removeError(errorObj.id);
        }, 30000);
    }

    removeError(errorId) {
        this.context.errors = this.context.errors.filter(e => e.id !== errorId);
        this.saveToStorage();
    }

    clearErrors() {
        this.context.errors = [];
        this.saveToStorage();
    }

    // ===== PERSISTENCIA =====
    saveToStorage() {
        try {
            const dataToSave = {
                ...this.context,
                session: {
                    ...this.context.session,
                    // No guardar location por privacidad
                    location: null
                }
            };
            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.context = { ...this.context, ...parsed };
                
                // Regenerar session ID si es muy antigua (24 horas)
                const sessionAge = Date.now() - this.context.session.startTime;
                if (sessionAge > 24 * 60 * 60 * 1000) {
                    this.context.session.id = this.generateSessionId();
                    this.context.session.startTime = Date.now();
                }
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            this.clearStorage();
        }
    }

    clearStorage() {
        localStorage.removeItem(this.storageKey);
        this.context = {
            user: null,
            brand: null,
            product: null,
            preferences: null,
            session: {
                id: this.generateSessionId(),
                startTime: Date.now(),
                device: this.getDeviceInfo(),
                browser: this.getBrowserInfo(),
                location: null
            },
            navigation: {
                currentStep: 1,
                totalSteps: 4,
                completedSteps: [],
                lastStep: null
            },
            errors: [],
            warnings: []
        };
    }

    // ===== EVENTOS =====
    setupEventListeners() {
        // Detectar cambios de página
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });

        // Detectar cambios de conectividad
        window.addEventListener('online', () => {
            this.context.session.browser.onLine = true;
            this.emit('connectionChanged', { online: true });
        });

        window.addEventListener('offline', () => {
            this.context.session.browser.onLine = false;
            this.emit('connectionChanged', { online: false });
        });

        // Detectar cambios de tamaño de ventana
        window.addEventListener('resize', () => {
            this.context.session.device.viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            this.emit('viewportChanged', this.context.session.device.viewport);
        });
    }

    emit(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        window.dispatchEvent(event);
    }

    on(eventName, callback) {
        window.addEventListener(eventName, callback);
    }

    off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }

    // ===== UTILIDADES =====
    getProgress() {
        const completed = this.context.navigation.completedSteps.length;
        const total = this.context.navigation.totalSteps;
        return Math.round((completed / total) * 100);
    }

    canNavigateTo(step) {
        const currentStep = this.context.navigation.currentStep;
        return step <= currentStep + 1;
    }

    getValidationErrors() {
        return this.context.errors.filter(e => e.type === 'validation');
    }

    getSystemErrors() {
        return this.context.errors.filter(e => e.type === 'system');
    }

    // ===== SINCRONIZACIÓN CON SUPABASE =====
    async syncWithSupabase() {
        try {
            if (!window.supabaseAPI) {
                throw new Error('Supabase API not available');
            }

            const syncData = {
                session: this.context.session,
                navigation: this.context.navigation,
                device: this.context.session.device,
                browser: this.context.session.browser
            };

            // Aquí se podría enviar datos de contexto a Supabase
            // para analytics o debugging
            console.log('Context sync data:', syncData);
            
            return { success: true, data: syncData };
        } catch (error) {
            this.addError({
                message: 'Error syncing context with Supabase',
                type: 'system',
                error
            });
            return { success: false, error };
        }
    }
}

// Inicializar contexto global
window.contextManager = new ContextManager();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextManager;
}
