// Serverless API - Sistema de APIs Simuladas en el Cliente
class ServerlessAPI {
    constructor() {
        this.endpoints = new Map();
        this.middleware = [];
        this.rateLimits = new Map();
        this.cache = new Map();
        this.webhooks = new Map();
        this.scheduledTasks = new Map();
        
        this.config = {
            enableCaching: true,
            enableRateLimit: true,
            enableLogging: true,
            defaultCacheTTL: 300000, // 5 minutes
            defaultRateLimit: 100, // per minute
            enableAuth: true,
            enableValidation: true
        };
        
        this.requestLogs = [];
        this.maxLogSize = 1000;
        
        this.init();
    }

    async init() {
        try {
            await this.setupDefaultEndpoints();
            await this.setupMiddleware();
            await this.startBackgroundTasks();
            
            console.log('🚀 ServerlessAPI initialized with', this.endpoints.size, 'endpoints');
        } catch (error) {
            console.error('❌ ServerlessAPI initialization failed:', error);
        }
    }

    // ========================
    // ENDPOINT MANAGEMENT
    // ========================

    endpoint(method, path, handler, options = {}) {
        const endpointKey = `${method.toUpperCase()}:${path}`;
        
        this.endpoints.set(endpointKey, {
            method: method.toUpperCase(),
            path: path,
            handler: handler,
            options: {
                auth: options.auth !== false,
                rateLimit: options.rateLimit || this.config.defaultRateLimit,
                cache: options.cache !== false,
                cacheTTL: options.cacheTTL || this.config.defaultCacheTTL,
                validation: options.validation,
                middleware: options.middleware || [],
                ...options
            }
        });
        
        return this;
    }

    get(path, handler, options = {}) {
        return this.endpoint('GET', path, handler, options);
    }

    post(path, handler, options = {}) {
        return this.endpoint('POST', path, handler, options);
    }

    put(path, handler, options = {}) {
        return this.endpoint('PUT', path, handler, options);
    }

    delete(path, handler, options = {}) {
        return this.endpoint('DELETE', path, handler, options);
    }

    patch(path, handler, options = {}) {
        return this.endpoint('PATCH', path, handler, options);
    }

    // ========================
    // REQUEST PROCESSING
    // ========================

    async request(method, path, data = null, headers = {}) {
        const requestId = this.generateRequestId();
        const startTime = performance.now();
        
        try {
            // Find matching endpoint
            const endpoint = this.findEndpoint(method, path);
            if (!endpoint) {
                throw new APIError('Endpoint not found', 404);
            }

            // Create request context
            const context = {
                requestId,
                method: method.toUpperCase(),
                path,
                data,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-ID': requestId,
                    'X-Timestamp': new Date().toISOString(),
                    ...headers
                },
                params: this.extractParams(endpoint.path, path),
                query: this.extractQuery(path),
                user: await this.getCurrentUser(),
                startTime
            };

            // Apply middleware
            await this.applyMiddleware(context, endpoint);

            // Check authentication
            if (endpoint.options.auth && !await this.checkAuth(context)) {
                throw new APIError('Authentication required', 401);
            }

            // Check rate limiting
            if (endpoint.options.rateLimit && !await this.checkRateLimit(context, endpoint)) {
                throw new APIError('Rate limit exceeded', 429);
            }

            // Validate request
            if (endpoint.options.validation) {
                await this.validateRequest(context, endpoint);
            }

            // Check cache
            if (method === 'GET' && endpoint.options.cache) {
                const cached = await this.getFromCache(context, endpoint);
                if (cached) {
                    await this.logRequest(context, { ...cached, cached: true });
                    return cached;
                }
            }

            // Execute handler
            const response = await this.executeHandler(context, endpoint);

            // Cache response
            if (method === 'GET' && endpoint.options.cache && response.status < 400) {
                await this.setCache(context, endpoint, response);
            }

            // Log request
            await this.logRequest(context, response);

            return response;

        } catch (error) {
            const errorResponse = this.formatError(error);
            await this.logRequest({ requestId, method, path, startTime }, errorResponse);
            return errorResponse;
        }
    }

    findEndpoint(method, path) {
        // Try exact match first
        const exactKey = `${method.toUpperCase()}:${path.split('?')[0]}`;
        if (this.endpoints.has(exactKey)) {
            return this.endpoints.get(exactKey);
        }

        // Try pattern matching
        for (const [key, endpoint] of this.endpoints) {
            const [endpointMethod, endpointPath] = key.split(':');
            if (endpointMethod === method.toUpperCase() && this.matchPath(endpointPath, path)) {
                return endpoint;
            }
        }

        return null;
    }

    matchPath(pattern, path) {
        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/:[^/]+/g, '([^/]+)')
            .replace(/\*/g, '.*');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path.split('?')[0]);
    }

    extractParams(pattern, path) {
        const params = {};
        const patternParts = pattern.split('/');
        const pathParts = path.split('?')[0].split('/');

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                const paramName = patternParts[i].substring(1);
                params[paramName] = pathParts[i];
            }
        }

        return params;
    }

    extractQuery(path) {
        const queryString = path.split('?')[1];
        if (!queryString) return {};

        const params = {};
        queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });

        return params;
    }

    async executeHandler(context, endpoint) {
        try {
            const result = await endpoint.handler(context);
            
            return {
                status: result.status || 200,
                data: result.data || result,
                headers: result.headers || {},
                timestamp: new Date().toISOString(),
                requestId: context.requestId
            };
        } catch (error) {
            throw new APIError(error.message, error.status || 500);
        }
    }

    // ========================
    // MIDDLEWARE SYSTEM
    // ========================

    use(middleware) {
        this.middleware.push(middleware);
        return this;
    }

    async applyMiddleware(context, endpoint) {
        // Global middleware
        for (const middleware of this.middleware) {
            await middleware(context);
        }

        // Endpoint-specific middleware
        for (const middleware of endpoint.options.middleware) {
            await middleware(context);
        }
    }

    async setupMiddleware() {
        // CORS middleware
        this.use(async (context) => {
            context.headers['Access-Control-Allow-Origin'] = '*';
            context.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            context.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        });

        // Request logging middleware
        this.use(async (context) => {
            if (this.config.enableLogging) {
                console.log(`📡 ${context.method} ${context.path}`, context.data);
            }
        });

        // Response time middleware
        this.use(async (context) => {
            context.responseTime = performance.now() - context.startTime;
        });
    }

    // ========================
    // AUTHENTICATION
    // ========================

    async getCurrentUser() {
        if (window.appState && window.appState.getIsAuthenticated()) {
            return window.appState.getUser();
        }
        return null;
    }

    async checkAuth(context) {
        // Check for API key in headers
        if (context.headers.Authorization) {
            return this.validateApiKey(context.headers.Authorization);
        }

        // Check for session-based auth
        if (context.user) {
            return true;
        }

        return false;
    }

    validateApiKey(authHeader) {
        // Simple API key validation
        const apiKey = authHeader.replace('Bearer ', '');
        const validKeys = ['ugc_api_key_demo', 'ugc_test_key'];
        return validKeys.includes(apiKey);
    }

    // ========================
    // RATE LIMITING
    // ========================

    async checkRateLimit(context, endpoint) {
        if (!this.config.enableRateLimit) return true;

        const key = `${context.user?.id || context.headers['X-Forwarded-For'] || 'anonymous'}:${endpoint.path}`;
        const limit = endpoint.options.rateLimit;
        const window = 60000; // 1 minute

        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, []);
        }

        const requests = this.rateLimits.get(key);
        const now = Date.now();
        
        // Remove old requests
        while (requests.length > 0 && now - requests[0] > window) {
            requests.shift();
        }

        if (requests.length >= limit) {
            return false;
        }

        requests.push(now);
        return true;
    }

    // ========================
    // CACHING
    // ========================

    async getFromCache(context, endpoint) {
        if (!this.config.enableCaching) return null;

        const cacheKey = this.generateCacheKey(context);
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < endpoint.options.cacheTTL) {
            return cached.response;
        }

        return null;
    }

    async setCache(context, endpoint, response) {
        if (!this.config.enableCaching) return;

        const cacheKey = this.generateCacheKey(context);
        this.cache.set(cacheKey, {
            response: response,
            timestamp: Date.now()
        });
    }

    generateCacheKey(context) {
        return `${context.method}:${context.path}:${JSON.stringify(context.query)}`;
    }

    clearCache(pattern = null) {
        if (pattern) {
            for (const key of this.cache.keys()) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    // ========================
    // VALIDATION
    // ========================

    async validateRequest(context, endpoint) {
        const validation = endpoint.options.validation;
        if (!validation) return;

        // Validate required fields
        if (validation.required) {
            for (const field of validation.required) {
                if (!context.data || context.data[field] === undefined) {
                    throw new APIError(`Missing required field: ${field}`, 400);
                }
            }
        }

        // Validate field types
        if (validation.types && context.data) {
            for (const [field, expectedType] of Object.entries(validation.types)) {
                if (context.data[field] !== undefined) {
                    const actualType = typeof context.data[field];
                    if (actualType !== expectedType) {
                        throw new APIError(`Invalid type for ${field}: expected ${expectedType}, got ${actualType}`, 400);
                    }
                }
            }
        }

        // Custom validation
        if (validation.custom) {
            await validation.custom(context);
        }
    }

    // ========================
    // DEFAULT ENDPOINTS
    // ========================

    async setupDefaultEndpoints() {
        // Health check
        this.get('/health', async () => ({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: performance.now()
        }), { auth: false, cache: false });

        // User endpoints
        this.get('/api/user/profile', async (context) => {
            if (!context.user) {
                throw new APIError('User not found', 404);
            }
            return { data: context.user };
        });

        this.put('/api/user/profile', async (context) => {
            if (!context.user) {
                throw new APIError('User not found', 404);
            }
            
            // Update user in app state
            if (window.appState) {
                window.appState.updateUser(context.data);
            }
            
            return { data: { ...context.user, ...context.data } };
        }, {
            validation: {
                types: {
                    name: 'string',
                    email: 'string'
                }
            }
        });

        // Projects endpoints
        this.get('/api/projects', async (context) => {
            const projects = await this.getFromDatabase('projects', {
                userId: context.user?.id
            });
            return { data: projects };
        });

        this.post('/api/projects', async (context) => {
            const project = {
                id: this.generateId(),
                ...context.data,
                userId: context.user?.id,
                createdAt: new Date().toISOString(),
                status: 'active'
            };
            
            await this.saveToDatabase('projects', project);
            return { data: project, status: 201 };
        }, {
            validation: {
                required: ['name', 'description'],
                types: {
                    name: 'string',
                    description: 'string'
                }
            }
        });

        this.get('/api/projects/:id', async (context) => {
            const project = await this.getFromDatabase('projects', {
                id: context.params.id,
                userId: context.user?.id
            });
            
            if (!project) {
                throw new APIError('Project not found', 404);
            }
            
            return { data: project };
        });

        // Products endpoints
        this.get('/api/products', async (context) => {
            const products = await this.getFromDatabase('products', {
                userId: context.user?.id
            });
            return { data: products };
        });

        this.post('/api/products', async (context) => {
            const product = {
                id: this.generateId(),
                ...context.data,
                userId: context.user?.id,
                createdAt: new Date().toISOString(),
                status: 'active'
            };
            
            await this.saveToDatabase('products', product);
            return { data: product, status: 201 };
        });

        // UGC endpoints
        this.post('/api/ugc/generate', async (context) => {
            // Simulate UGC generation
            const generation = {
                id: this.generateId(),
                projectId: context.data.projectId,
                styleId: context.data.styleId,
                userId: context.user?.id,
                config: context.data.config,
                status: 'processing',
                createdAt: new Date().toISOString()
            };
            
            // Simulate processing time
            setTimeout(async () => {
                generation.status = 'completed';
                generation.results = this.generateMockUGCResults(context.data);
                await this.saveToDatabase('ugcContent', generation);
                
                // Trigger webhook if configured
                this.triggerWebhook('ugc.generated', generation);
            }, 3000);
            
            await this.saveToDatabase('ugcContent', generation);
            return { data: generation, status: 202 };
        }, {
            validation: {
                required: ['projectId', 'styleId', 'config'],
                types: {
                    projectId: 'string',
                    styleId: 'string',
                    config: 'object'
                }
            }
        });

        this.get('/api/ugc/:id', async (context) => {
            const ugc = await this.getFromDatabase('ugcContent', {
                id: context.params.id,
                userId: context.user?.id
            });
            
            if (!ugc) {
                throw new APIError('UGC not found', 404);
            }
            
            return { data: ugc };
        });

        // Analytics endpoints
        this.get('/api/analytics/overview', async (context) => {
            const timeRange = context.query.range || '7d';
            const analytics = await this.generateAnalyticsOverview(timeRange, context.user?.id);
            return { data: analytics };
        });

        this.get('/api/analytics/events', async (context) => {
            const events = await this.getFromDatabase('analytics', {
                userId: context.user?.id,
                limit: parseInt(context.query.limit) || 100
            });
            return { data: events };
        });

        // File upload simulation
        this.post('/api/upload', async (context) => {
            const file = {
                id: this.generateId(),
                name: context.data.name || 'uploaded_file',
                size: context.data.size || 0,
                type: context.data.type || 'application/octet-stream',
                url: `https://cdn.ugcstudio.com/uploads/${this.generateId()}`,
                uploadedAt: new Date().toISOString(),
                userId: context.user?.id
            };
            
            return { data: file, status: 201 };
        }, { auth: false });

        // Settings endpoints
        this.get('/api/settings', async (context) => {
            const settings = await this.getUserSettings(context.user?.id);
            return { data: settings };
        });

        this.put('/api/settings', async (context) => {
            await this.saveUserSettings(context.user?.id, context.data);
            return { data: context.data };
        });
    }

    // ========================
    // DATABASE HELPERS
    // ========================

    async getFromDatabase(collection, query = {}) {
        if (!window.localDB || !window.localDB.isReady) {
            return [];
        }

        try {
            if (query.id) {
                const item = await window.localDB.get(collection, query.id);
                return item && (!query.userId || item.userId === query.userId) ? [item] : [];
            }

            const items = await window.localDB.getAll(collection);
            return items.filter(item => {
                for (const [key, value] of Object.entries(query)) {
                    if (key === 'limit') continue;
                    if (item[key] !== value) return false;
                }
                return true;
            }).slice(0, query.limit || 1000);
        } catch (error) {
            console.error('Database error:', error);
            return [];
        }
    }

    async saveToDatabase(collection, data) {
        if (!window.localDB || !window.localDB.isReady) {
            return false;
        }

        try {
            await window.localDB.put(collection, data);
            return true;
        } catch (error) {
            console.error('Database save error:', error);
            return false;
        }
    }

    async getUserSettings(userId) {
        if (!window.localDB || !window.localDB.isReady) {
            return {};
        }

        try {
            const settings = await window.localDB.getUserSettings(userId);
            const result = {};
            
            for (const setting of settings) {
                result[setting.key] = setting.value;
            }
            
            return result;
        } catch (error) {
            return {};
        }
    }

    async saveUserSettings(userId, settings) {
        if (!window.localDB || !window.localDB.isReady) {
            return false;
        }

        try {
            for (const [key, value] of Object.entries(settings)) {
                await window.localDB.setSetting(key, value, userId);
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    // ========================
    // MOCK DATA GENERATORS
    // ========================

    generateMockUGCResults(config) {
        const results = [];
        const quantity = config.quantity || 3;
        
        for (let i = 0; i < quantity; i++) {
            results.push({
                id: this.generateId(),
                type: config.format || 'video',
                url: `https://cdn.ugcstudio.com/generated/${this.generateId()}.mp4`,
                thumbnail: `https://cdn.ugcstudio.com/thumbnails/${this.generateId()}.jpg`,
                duration: config.format === 'video' ? Math.floor(Math.random() * 30) + 15 : null,
                resolution: config.format === 'video' ? '1920x1080' : '1200x800',
                size: Math.floor(Math.random() * 50) + 10, // MB
                createdAt: new Date().toISOString()
            });
        }
        
        return results;
    }

    async generateAnalyticsOverview(timeRange, userId) {
        const endDate = new Date();
        const startDate = new Date();
        
        switch (timeRange) {
            case '1d': startDate.setDate(endDate.getDate() - 1); break;
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            default: startDate.setDate(endDate.getDate() - 7);
        }

        return {
            timeRange,
            metrics: {
                pageViews: Math.floor(Math.random() * 1000) + 100,
                uniqueVisitors: Math.floor(Math.random() * 100) + 50,
                avgSessionDuration: Math.floor(Math.random() * 300) + 120,
                bounceRate: Math.floor(Math.random() * 30) + 20,
                conversions: Math.floor(Math.random() * 50) + 10
            },
            charts: {
                pageViews: this.generateTimeSeriesData(7),
                userSessions: this.generateTimeSeriesData(7),
                deviceTypes: {
                    desktop: 60,
                    mobile: 35,
                    tablet: 5
                }
            }
        };
    }

    generateTimeSeriesData(days) {
        const data = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            data.push({
                date: date.toISOString().split('T')[0],
                value: Math.floor(Math.random() * 100) + 20
            });
        }
        return data;
    }

    // ========================
    // WEBHOOKS
    // ========================

    webhook(event, url, options = {}) {
        this.webhooks.set(event, {
            url,
            method: options.method || 'POST',
            headers: options.headers || {},
            retries: options.retries || 3,
            timeout: options.timeout || 30000
        });
        return this;
    }

    async triggerWebhook(event, data) {
        const webhook = this.webhooks.get(event);
        if (!webhook) return;

        try {
            console.log(`🔗 Triggering webhook for ${event}:`, data);
            
            // In a real implementation, this would make an HTTP request
            // For simulation, we'll just log it
            const payload = {
                event,
                data,
                timestamp: new Date().toISOString(),
                id: this.generateId()
            };
            
            // Simulate webhook processing
            try {
                if (window.analyticsEngine && typeof window.analyticsEngine.trackEvent === 'function') {
                    window.analyticsEngine.trackEvent('webhook_triggered', {
                        event,
                        webhookUrl: webhook.url,
                        success: true
                    });
                }
            } catch (error) {
                console.warn('⚠️ Error en analytics tracking (webhook_triggered):', error);
            }
            
        } catch (error) {
            console.error(`❌ Webhook failed for ${event}:`, error);
        }
    }

    // ========================
    // SCHEDULED TASKS
    // ========================

    schedule(name, cronPattern, task) {
        this.scheduledTasks.set(name, {
            pattern: cronPattern,
            task,
            lastRun: null,
            nextRun: this.calculateNextRun(cronPattern)
        });
        return this;
    }

    calculateNextRun(cronPattern) {
        // Simplified cron calculation
        const now = new Date();
        const nextRun = new Date(now.getTime() + 60000); // Next minute for simplicity
        return nextRun;
    }

    async startBackgroundTasks() {
        // Cache cleanup
        setInterval(() => {
            this.cleanupCache();
        }, 300000); // Every 5 minutes
        
        // Rate limit cleanup
        setInterval(() => {
            this.cleanupRateLimits();
        }, 60000); // Every minute
        
        // Process scheduled tasks
        setInterval(() => {
            this.processScheduledTasks();
        }, 60000); // Every minute
    }

    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.cache) {
            if (now - value.timestamp > this.config.defaultCacheTTL) {
                this.cache.delete(key);
            }
        }
    }

    cleanupRateLimits() {
        const oneHourAgo = Date.now() - 3600000;
        for (const [key, requests] of this.rateLimits) {
            const recentRequests = requests.filter(time => time > oneHourAgo);
            if (recentRequests.length === 0) {
                this.rateLimits.delete(key);
            } else {
                this.rateLimits.set(key, recentRequests);
            }
        }
    }

    async processScheduledTasks() {
        const now = new Date();
        
        for (const [name, task] of this.scheduledTasks) {
            if (now >= task.nextRun) {
                try {
                    await task.task();
                    task.lastRun = now;
                    task.nextRun = this.calculateNextRun(task.pattern);
                    console.log(`⏰ Scheduled task '${name}' executed successfully`);
                } catch (error) {
                    console.error(`❌ Scheduled task '${name}' failed:`, error);
                }
            }
        }
    }

    // ========================
    // LOGGING & MONITORING
    // ========================

    async logRequest(context, response) {
        const logEntry = {
            requestId: context.requestId,
            method: context.method,
            path: context.path,
            status: response.status,
            responseTime: context.responseTime || (performance.now() - context.startTime),
            timestamp: new Date().toISOString(),
            userAgent: context.headers?.['User-Agent'] || navigator.userAgent || 'Unknown',
            userId: context.user?.id,
            cached: response.cached || false
        };

        this.requestLogs.push(logEntry);
        
        // Keep only recent logs
        if (this.requestLogs.length > this.maxLogSize) {
            this.requestLogs = this.requestLogs.slice(-this.maxLogSize);
        }

        // Track in analytics
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.trackEvent === 'function') {
                window.analyticsEngine.trackEvent('api_request', logEntry);
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (api_request):', error);
        }
    }

    getRequestLogs(limit = 100) {
        return this.requestLogs.slice(-limit);
    }

    getStats() {
        return {
            endpoints: this.endpoints.size,
            totalRequests: this.requestLogs.length,
            cacheSize: this.cache.size,
            rateLimitedIPs: this.rateLimits.size,
            webhooks: this.webhooks.size,
            scheduledTasks: this.scheduledTasks.size,
            uptime: performance.now()
        };
    }

    // ========================
    // UTILITY METHODS
    // ========================

    generateId() {
        return 'api_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateRequestId() {
        return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatError(error) {
        return {
            status: error.status || 500,
            data: {
                error: error.message || 'Internal Server Error',
                code: error.code || 'INTERNAL_ERROR',
                timestamp: new Date().toISOString()
            },
            headers: {}
        };
    }
}

// Custom API Error class
class APIError extends Error {
    constructor(message, status = 500, code = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
    }
}

// Global API instance
let serverlessAPI;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    serverlessAPI = new ServerlessAPI();
    window.serverlessAPI = serverlessAPI;
    
    // Create global fetch-like interface
    window.api = {
        get: (path, headers) => serverlessAPI.request('GET', path, null, headers),
        post: (path, data, headers) => serverlessAPI.request('POST', path, data, headers),
        put: (path, data, headers) => serverlessAPI.request('PUT', path, data, headers),
        delete: (path, headers) => serverlessAPI.request('DELETE', path, null, headers),
        patch: (path, data, headers) => serverlessAPI.request('PATCH', path, data, headers)
    };
    
    console.log('🚀 ServerlessAPI ready');
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ServerlessAPI, APIError };
}


