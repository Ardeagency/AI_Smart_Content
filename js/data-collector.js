// Data Collector - Sistema de Recolección de Datos Serverless
class DataCollector {
    constructor() {
        this.deviceId = null;
        this.sessionId = null;
        this.collectedData = {
            device: {},
            browser: {},
            user: {},
            usage: {},
            performance: {},
            location: {},
            preferences: {}
        };
        
        this.metrics = {
            sessions: [],
            events: [],
            interactions: [],
            errors: [],
            performance: []
        };
        
        this.isInitialized = false;
        this.collectionEnabled = true;
        
        this.init();
    }

    async init() {
        try {
            await this.generateDeviceId();
            await this.generateSessionId();
            await this.collectDeviceInfo();
            await this.collectBrowserInfo();
            await this.collectSystemInfo();
            await this.collectLocationInfo();
            await this.setupEventListeners();
            await this.loadStoredData();
            
            this.isInitialized = true;
            this.startSession();
            
            console.log('📊 DataCollector initialized:', this.getCollectionSummary());
        } catch (error) {
            console.error('❌ DataCollector initialization failed:', error);
        }
    }

    // ========================
    // DEVICE IDENTIFICATION
    // ========================

    async generateDeviceId() {
        // Check if device ID already exists
        let deviceId = localStorage.getItem('ugc_device_id');
        
        if (!deviceId) {
            // Generate unique device fingerprint
            const fingerprint = await this.generateDeviceFingerprint();
            deviceId = this.hashString(fingerprint);
            localStorage.setItem('ugc_device_id', deviceId);
            localStorage.setItem('ugc_device_created', new Date().toISOString());
        }
        
        this.deviceId = deviceId;
        this.collectedData.device.id = deviceId;
        this.collectedData.device.createdAt = localStorage.getItem('ugc_device_created');
    }

    async generateDeviceFingerprint() {
        const components = [];
        
        // Screen information
        components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
        components.push(screen.availWidth + 'x' + screen.availHeight);
        
        // Timezone
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
        
        // Language
        components.push(navigator.language);
        components.push(navigator.languages?.join(',') || '');
        
        // Platform
        components.push(navigator.platform);
        components.push(navigator.userAgent);
        
        // Hardware concurrency
        components.push(navigator.hardwareConcurrency || 0);
        
        // Memory (if available)
        components.push(navigator.deviceMemory || 0);
        
        // Canvas fingerprint
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('UGC Studio Device ID', 2, 2);
            components.push(canvas.toDataURL());
        } catch (e) {
            components.push('canvas_error');
        }
        
        // WebGL fingerprint
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                    components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                }
            }
        } catch (e) {
            components.push('webgl_error');
        }
        
        return components.join('|');
    }

    generateSessionId() {
        this.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('ugc_session_id', this.sessionId);
        sessionStorage.setItem('ugc_session_start', new Date().toISOString());
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'dev_' + Math.abs(hash).toString(36);
    }

    // ========================
    // DEVICE INFO COLLECTION
    // ========================

    async collectDeviceInfo() {
        this.collectedData.device = {
            ...this.collectedData.device,
            type: this.getDeviceType(),
            brand: this.getDeviceBrand(),
            model: this.getDeviceModel(),
            os: this.getOperatingSystem(),
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                orientation: screen.orientation?.type || 'unknown'
            },
            hardware: {
                cores: navigator.hardwareConcurrency || 'unknown',
                memory: navigator.deviceMemory || 'unknown',
                connection: this.getConnectionInfo()
            },
            capabilities: await this.getDeviceCapabilities()
        };
    }

    getDeviceType() {
        const ua = navigator.userAgent.toLowerCase();
        
        if (/tablet|ipad|playbook|silk/i.test(ua)) {
            return 'tablet';
        } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
            return 'mobile';
        } else if (/tv|smart-tv|googletv|appletv|hbbtv|pov_tv|netcast\.tv/i.test(ua)) {
            return 'tv';
        } else {
            return 'desktop';
        }
    }

    getDeviceBrand() {
        const ua = navigator.userAgent.toLowerCase();
        
        const brands = {
            'apple': /iphone|ipad|ipod|macintosh|mac os x/,
            'samsung': /samsung|sm-|gt-|galaxy/,
            'google': /pixel|nexus|android/,
            'microsoft': /windows|microsoft|xbox/,
            'amazon': /kindle|fire|alexa/,
            'sony': /sony|playstation/,
            'lg': /lg/,
            'htc': /htc/,
            'huawei': /huawei|honor/,
            'xiaomi': /xiaomi|mi\s/
        };
        
        for (const [brand, regex] of Object.entries(brands)) {
            if (regex.test(ua)) {
                return brand;
            }
        }
        
        return 'unknown';
    }

    getDeviceModel() {
        const ua = navigator.userAgent;
        
        // iPhone models
        if (/iPhone/.test(ua)) {
            const model = ua.match(/iPhone OS (\d+_\d+)/);
            return model ? `iPhone iOS ${model[1].replace('_', '.')}` : 'iPhone';
        }
        
        // iPad models
        if (/iPad/.test(ua)) {
            const model = ua.match(/OS (\d+_\d+)/);
            return model ? `iPad iOS ${model[1].replace('_', '.')}` : 'iPad';
        }
        
        // Android models
        if (/Android/.test(ua)) {
            const version = ua.match(/Android (\d+\.?\d*)/);
            const device = ua.match(/;\s*([^)]+)\)/);
            return `Android ${version ? version[1] : 'Unknown'} ${device ? device[1] : ''}`.trim();
        }
        
        // Windows
        if (/Windows/.test(ua)) {
            const version = ua.match(/Windows NT (\d+\.\d+)/);
            return version ? `Windows ${version[1]}` : 'Windows';
        }
        
        // macOS
        if (/Mac OS X/.test(ua)) {
            const version = ua.match(/Mac OS X (\d+_\d+)/);
            return version ? `macOS ${version[1].replace('_', '.')}` : 'macOS';
        }
        
        return navigator.platform || 'Unknown';
    }

    getOperatingSystem() {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        
        const systems = {
            'Windows': /Windows/,
            'macOS': /Mac OS X|Macintosh/,
            'iOS': /iPhone|iPad|iPod/,
            'Android': /Android/,
            'Linux': /Linux/,
            'Chrome OS': /CrOS/,
            'Firefox OS': /Mobile.*Firefox/
        };
        
        for (const [os, regex] of Object.entries(systems)) {
            if (regex.test(ua)) {
                return os;
            }
        }
        
        return platform || 'Unknown';
    }

    getConnectionInfo() {
        if (!navigator.connection) return null;
        
        const conn = navigator.connection;
        return {
            effectiveType: conn.effectiveType,
            downlink: conn.downlink,
            rtt: conn.rtt,
            saveData: conn.saveData
        };
    }

    async getDeviceCapabilities() {
        const capabilities = {
            touch: 'ontouchstart' in window,
            geolocation: 'geolocation' in navigator,
            camera: false,
            microphone: false,
            bluetooth: 'bluetooth' in navigator,
            battery: 'getBattery' in navigator,
            vibration: 'vibrate' in navigator,
            notifications: 'Notification' in window,
            serviceWorker: 'serviceWorker' in navigator,
            webGL: this.checkWebGLSupport(),
            webRTC: this.checkWebRTCSupport(),
            localStorage: this.checkLocalStorageSupport(),
            indexedDB: 'indexedDB' in window,
            webAssembly: 'WebAssembly' in window
        };
        
        // Check media permissions
        try {
            const permissions = await Promise.allSettled([
                navigator.permissions?.query({ name: 'camera' }),
                navigator.permissions?.query({ name: 'microphone' })
            ]);
            
            capabilities.camera = permissions[0]?.value?.state !== 'denied';
            capabilities.microphone = permissions[1]?.value?.state !== 'denied';
        } catch (e) {
            // Permissions API not supported
        }
        
        return capabilities;
    }

    checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }

    checkWebRTCSupport() {
        return !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);
    }

    checkLocalStorageSupport() {
        try {
            const test = 'test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ========================
    // BROWSER INFO COLLECTION
    // ========================

    async collectBrowserInfo() {
        this.collectedData.browser = {
            name: this.getBrowserName(),
            version: this.getBrowserVersion(),
            engine: this.getBrowserEngine(),
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages || [],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack === '1',
            onLine: navigator.onLine,
            plugins: this.getPluginInfo(),
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            }
        };
    }

    getBrowserName() {
        const ua = navigator.userAgent;
        
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('SamsungBrowser')) return 'Samsung Browser';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
        if (ua.includes('Edge')) return 'Edge';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('MSIE') || ua.includes('Trident')) return 'Internet Explorer';
        
        return 'Unknown';
    }

    getBrowserVersion() {
        const ua = navigator.userAgent;
        
        const patterns = {
            'Firefox': /Firefox\/(\d+\.?\d*)/,
            'Chrome': /Chrome\/(\d+\.?\d*)/,
            'Safari': /Version\/(\d+\.?\d*)/,
            'Edge': /Edge\/(\d+\.?\d*)/,
            'Opera': /(?:Opera|OPR)\/(\d+\.?\d*)/
        };
        
        const browserName = this.getBrowserName();
        const pattern = patterns[browserName];
        
        if (pattern) {
            const match = ua.match(pattern);
            return match ? match[1] : 'Unknown';
        }
        
        return 'Unknown';
    }

    getBrowserEngine() {
        const ua = navigator.userAgent;
        
        if (ua.includes('Gecko') && !ua.includes('like Gecko')) return 'Gecko';
        if (ua.includes('WebKit')) return 'WebKit';
        if (ua.includes('Trident')) return 'Trident';
        if (ua.includes('EdgeHTML')) return 'EdgeHTML';
        
        return 'Unknown';
    }

    getPluginInfo() {
        const plugins = [];
        
        for (let i = 0; i < navigator.plugins.length; i++) {
            const plugin = navigator.plugins[i];
            plugins.push({
                name: plugin.name,
                filename: plugin.filename,
                description: plugin.description
            });
        }
        
        return plugins;
    }

    // ========================
    // SYSTEM INFO COLLECTION
    // ========================

    async collectSystemInfo() {
        this.collectedData.performance = {
            memory: this.getMemoryInfo(),
            timing: this.getPerformanceTiming(),
            navigation: this.getNavigationInfo(),
            resources: this.getResourceTimings()
        };
    }

    getMemoryInfo() {
        if (!performance.memory) return null;
        
        return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
    }

    getPerformanceTiming() {
        if (!performance.timing) return null;
        
        const timing = performance.timing;
        return {
            navigationStart: timing.navigationStart,
            domainLookupStart: timing.domainLookupStart,
            domainLookupEnd: timing.domainLookupEnd,
            connectStart: timing.connectStart,
            connectEnd: timing.connectEnd,
            requestStart: timing.requestStart,
            responseStart: timing.responseStart,
            responseEnd: timing.responseEnd,
            domLoading: timing.domLoading,
            domContentLoadedEventStart: timing.domContentLoadedEventStart,
            domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
            domComplete: timing.domComplete,
            loadEventStart: timing.loadEventStart,
            loadEventEnd: timing.loadEventEnd
        };
    }

    getNavigationInfo() {
        if (!performance.navigation) return null;
        
        const types = {
            0: 'navigate',
            1: 'reload',
            2: 'back_forward',
            255: 'reserved'
        };
        
        return {
            type: types[performance.navigation.type] || 'unknown',
            redirectCount: performance.navigation.redirectCount
        };
    }

    getResourceTimings() {
        return performance.getEntriesByType('resource').slice(-10).map(entry => ({
            name: entry.name,
            duration: entry.duration,
            size: entry.transferSize || 0,
            type: entry.initiatorType
        }));
    }

    // ========================
    // LOCATION INFO COLLECTION
    // ========================

    async collectLocationInfo() {
        try {
            // Get timezone information
            this.collectedData.location = {
                timezone: {
                    name: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    offset: new Date().getTimezoneOffset(),
                    locale: navigator.language
                },
                approximate: await this.getApproximateLocation()
            };
        } catch (error) {
            console.warn('Location collection failed:', error);
            this.collectedData.location = {
                timezone: {
                    name: 'Unknown',
                    offset: 0,
                    locale: navigator.language
                },
                approximate: null
            };
        }
    }

    async getApproximateLocation() {
        try {
            // Use IP-based geolocation (simulated for privacy)
            const response = await fetch('https://ipapi.co/json/').catch(() => null);
            if (response && response.ok) {
                const data = await response.json();
                return {
                    country: data.country_name,
                    region: data.region,
                    city: data.city,
                    countryCode: data.country_code
                };
            }
        } catch (error) {
            // Fallback to timezone-based approximation
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const parts = timezone.split('/');
            return {
                region: parts[0] || 'Unknown',
                city: parts[1] || 'Unknown',
                country: 'Unknown',
                countryCode: 'XX'
            };
        }
        
        return null;
    }

    // ========================
    // EVENT TRACKING
    // ========================

    setupEventListeners() {
        // Page visibility
        document.addEventListener('visibilitychange', () => {
            this.trackEvent('page_visibility', {
                hidden: document.hidden,
                visibilityState: document.visibilityState
            });
        });

        // Window focus/blur
        window.addEventListener('focus', () => this.trackEvent('window_focus'));
        window.addEventListener('blur', () => this.trackEvent('window_blur'));

        // Resize events
        window.addEventListener('resize', this.debounce(() => {
            this.trackEvent('window_resize', {
                width: window.innerWidth,
                height: window.innerHeight
            });
        }, 250));

        // Online/offline status
        window.addEventListener('online', () => this.trackEvent('connection_online'));
        window.addEventListener('offline', () => this.trackEvent('connection_offline'));

        // Before unload
        window.addEventListener('beforeunload', () => {
            this.endSession();
        });

        // Error tracking
        window.addEventListener('error', (event) => {
            this.trackError({
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                type: 'javascript'
            });
        });

        // Promise rejection tracking
        window.addEventListener('unhandledrejection', (event) => {
            this.trackError({
                message: event.reason?.message || 'Unhandled Promise Rejection',
                type: 'promise',
                reason: event.reason
            });
        });
    }

    // ========================
    // DATA TRACKING METHODS
    // ========================

    trackEvent(eventName, data = {}) {
        if (!this.collectionEnabled) return;
        
        const event = {
            id: this.generateEventId(),
            name: eventName,
            data: data,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            deviceId: this.deviceId,
            url: window.location.href,
            referrer: document.referrer
        };
        
        this.metrics.events.push(event);
        this.saveDataToStorage();
        
        // Solo log para eventos importantes, no para spam
        if (this.isImportantEvent(eventName)) {
            console.log('📊 Event tracked:', eventName, data);
        }
    }

    isImportantEvent(eventName) {
        // Lista de eventos importantes que vale la pena loggear
        const importantEvents = [
            'user_registration',
            'user_login',
            'payment_completed',
            'onboarding_started',
            'onboarding_completed',
            'project_created',
            'ugc_generated',
            'error_occurred',
            'page_view'
        ];
        
        return importantEvents.includes(eventName);
    }

    trackInteraction(element, action, details = {}) {
        const interaction = {
            id: this.generateEventId(),
            element: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                textContent: element.textContent?.substring(0, 100)
            },
            action: action,
            details: details,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            position: {
                x: details.clientX || 0,
                y: details.clientY || 0
            }
        };
        
        this.metrics.interactions.push(interaction);
        this.saveDataToStorage();
    }

    trackError(error) {
        const errorData = {
            id: this.generateEventId(),
            ...error,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            deviceId: this.deviceId,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        this.metrics.errors.push(errorData);
        this.saveDataToStorage();
        
        console.error('❌ Error tracked:', error);
    }

    trackPerformance(name, data) {
        const perfData = {
            id: this.generateEventId(),
            name: name,
            data: data,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            memory: this.getMemoryInfo()
        };
        
        this.metrics.performance.push(perfData);
        this.saveDataToStorage();
    }

    // ========================
    // SESSION MANAGEMENT
    // ========================

    startSession() {
        const session = {
            id: this.sessionId,
            deviceId: this.deviceId,
            startTime: new Date().toISOString(),
            userAgent: navigator.userAgent,
            referrer: document.referrer,
            landingPage: window.location.href,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
        
        this.metrics.sessions.push(session);
        this.trackEvent('session_start', session);
    }

    endSession() {
        const sessionIndex = this.metrics.sessions.findIndex(s => s.id === this.sessionId);
        if (sessionIndex >= 0) {
            this.metrics.sessions[sessionIndex].endTime = new Date().toISOString();
            this.metrics.sessions[sessionIndex].duration = Date.now() - new Date(this.metrics.sessions[sessionIndex].startTime).getTime();
        }
        
        this.trackEvent('session_end');
        this.saveDataToStorage();
    }

    // ========================
    // DATA MANAGEMENT
    // ========================

    saveDataToStorage() {
        try {
            // Save to localStorage with compression
            const dataToSave = {
                device: this.collectedData,
                metrics: this.metrics,
                lastUpdated: new Date().toISOString()
            };
            
            // Keep only recent data to avoid storage limits
            this.trimOldData();
            
            localStorage.setItem('ugc_analytics_data', JSON.stringify(dataToSave));
        } catch (error) {
            console.warn('Failed to save analytics data:', error);
        }
    }

    loadStoredData() {
        try {
            const stored = localStorage.getItem('ugc_analytics_data');
            if (stored) {
                const data = JSON.parse(stored);
                this.metrics = { ...this.metrics, ...data.metrics };
            }
        } catch (error) {
            console.warn('Failed to load stored analytics data:', error);
        }
    }

    trimOldData() {
        const maxEvents = 1000;
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        const cutoff = new Date(Date.now() - maxAge).toISOString();
        
        // Trim events
        this.metrics.events = this.metrics.events
            .filter(event => event.timestamp > cutoff)
            .slice(-maxEvents);
        
        // Trim interactions
        this.metrics.interactions = this.metrics.interactions
            .filter(interaction => interaction.timestamp > cutoff)
            .slice(-maxEvents);
        
        // Trim errors
        this.metrics.errors = this.metrics.errors
            .filter(error => error.timestamp > cutoff)
            .slice(-100);
        
        // Trim performance data
        this.metrics.performance = this.metrics.performance
            .filter(perf => perf.timestamp > cutoff)
            .slice(-500);
    }

    // ========================
    // UTILITY METHODS
    // ========================

    generateEventId() {
        return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ========================
    // PUBLIC API
    // ========================

    getDeviceId() {
        return this.deviceId;
    }

    getSessionId() {
        return this.sessionId;
    }

    getCollectedData() {
        return { ...this.collectedData };
    }

    getMetrics() {
        return { ...this.metrics };
    }

    getCollectionSummary() {
        return {
            deviceId: this.deviceId,
            sessionId: this.sessionId,
            isInitialized: this.isInitialized,
            collectionEnabled: this.collectionEnabled,
            dataPoints: {
                events: this.metrics.events.length,
                interactions: this.metrics.interactions.length,
                errors: this.metrics.errors.length,
                sessions: this.metrics.sessions.length
            },
            device: {
                type: this.collectedData.device.type,
                os: this.collectedData.device.os,
                browser: `${this.collectedData.browser?.name} ${this.collectedData.browser?.version}`
            }
        };
    }

    enableCollection() {
        this.collectionEnabled = true;
        this.trackEvent('collection_enabled');
    }

    disableCollection() {
        this.collectionEnabled = false;
        this.trackEvent('collection_disabled');
    }

    clearData() {
        this.metrics = {
            sessions: [],
            events: [],
            interactions: [],
            errors: [],
            performance: []
        };
        
        localStorage.removeItem('ugc_analytics_data');
        this.trackEvent('data_cleared');
    }

    exportData() {
        return {
            device: this.collectedData,
            metrics: this.metrics,
            summary: this.getCollectionSummary(),
            exportedAt: new Date().toISOString()
        };
    }
}

// Global instance
let dataCollector;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    dataCollector = new DataCollector();
    window.dataCollector = dataCollector;
    
    // Setup automatic interaction tracking
    document.addEventListener('click', (event) => {
        if (dataCollector && dataCollector.isInitialized) {
            dataCollector.trackInteraction(event.target, 'click', {
                clientX: event.clientX,
                clientY: event.clientY,
                button: event.button
            });
        }
    });
    
    document.addEventListener('input', (event) => {
        if (dataCollector && dataCollector.isInitialized && event.target.type !== 'password') {
            dataCollector.trackInteraction(event.target, 'input', {
                inputType: event.target.type,
                value: event.target.value?.length || 0
            });
        }
    });
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataCollector;
}


