// Backend Integrator - Sistema Central de Integración Serverless
class BackendIntegrator {
    constructor() {
        this.services = {
            dataCollector: null,
            localDB: null,
            analyticsEngine: null,
            serverlessAPI: null
        };
        
        this.isInitialized = false;
        this.initializationPromise = null;
        
        this.config = {
            enableSync: true,
            enableOfflineMode: true,
            enableRealTimeUpdates: true,
            syncInterval: 30000, // 30 seconds
            offlineQueueLimit: 1000,
            retryAttempts: 3
        };
        
        this.syncQueue = [];
        this.offlineMode = !navigator.onLine;
        this.syncTimer = null;
        this.eventListeners = new Map();
        
        this.init();
    }

    async init() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._initialize();
        return this.initializationPromise;
    }

    async _initialize() {
        try {
            console.log('🔗 Backend Integrator initializing...');
            
            // Wait for services to be available
            await this.waitForServices();
            
            // Connect services
            await this.connectServices();
            
            // Setup integrations
            await this.setupIntegrations();
            
            // Start background processes
            await this.startBackgroundProcesses();
            
            this.isInitialized = true;
            console.log('✅ Backend Integrator initialized successfully');
            
            // Emit ready event
            this.emit('ready', this.getSystemStatus());
            
        } catch (error) {
            console.error('❌ Backend Integrator initialization failed:', error);
            throw error;
        }
    }

    // ========================
    // SERVICE CONNECTION
    // ========================

    async waitForServices() {
        const maxWaitTime = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            // Check if all required services are available
            if (window.dataCollector && 
                window.localDB && 
                window.analyticsEngine && 
                window.serverlessAPI) {
                
                this.services.dataCollector = window.dataCollector;
                this.services.localDB = window.localDB;
                this.services.analyticsEngine = window.analyticsEngine;
                this.services.serverlessAPI = window.serverlessAPI;
                
                return true;
            }
            
            await this.delay(100);
        }
        
        throw new Error('Required services not available within timeout');
    }

    async connectServices() {
        // Connect DataCollector with LocalDB
        this.connectDataCollectorToDatabase();
        
        // Connect AnalyticsEngine with DataCollector
        this.connectAnalyticsToDataCollector();
        
        // Connect ServerlessAPI with LocalDB
        this.connectAPIToDatabase();
        
        // Setup cross-service communication
        this.setupCrossServiceCommunication();
    }

    connectDataCollectorToDatabase() {
        if (!this.services.dataCollector || typeof this.services.dataCollector.trackEvent !== 'function') {
            console.warn('DataCollector not available or missing trackEvent method');
            return;
        }
        
        const originalTrackEvent = this.services.dataCollector.trackEvent.bind(this.services.dataCollector);
        
        this.services.dataCollector.trackEvent = async (eventName, data) => {
            try {
                // Call original method
                originalTrackEvent(eventName, data);
                
                // Also save to database
                if (this.services.localDB && this.services.localDB.isReady) {
                    try {
                        await this.services.localDB.saveAnalytics({
                            name: eventName,
                            data: data,
                            timestamp: new Date().toISOString(),
                            sessionId: this.services.dataCollector.getSessionId ? this.services.dataCollector.getSessionId() : 'unknown',
                            deviceId: this.services.dataCollector.getDeviceId ? this.services.dataCollector.getDeviceId() : 'unknown',
                            type: 'event'
                        });
                    } catch (error) {
                        console.warn('Failed to save event to database:', error);
                    }
                }
            } catch (error) {
                console.warn('Error in trackEvent:', error);
            }
        };
    }

    connectAnalyticsToDataCollector() {
        // Hook into analytics events
        if (this.services.analyticsEngine && typeof this.services.analyticsEngine.trackEvent === 'function') {
            const originalAnalyticsTrack = this.services.analyticsEngine.trackEvent.bind(this.services.analyticsEngine);
            
            this.services.analyticsEngine.trackEvent = (name, data) => {
                try {
                    originalAnalyticsTrack(name, data);
                    
                    // REMOVED: Automatic analytics_processed events to prevent spam
                    // Only track critical events to avoid infinite loops
                    
                } catch (error) {
                    console.warn('Error in analytics trackEvent:', error);
                }
            };
        }
    }

    connectAPIToDatabase() {
        // Override API database methods to use our local database
        const api = this.services.serverlessAPI;
        
        const originalGetFromDatabase = api.getFromDatabase.bind(api);
        const originalSaveToDatabase = api.saveToDatabase.bind(api);
        
        api.getFromDatabase = async (collection, query) => {
            try {
                return await originalGetFromDatabase(collection, query);
            } catch (error) {
                console.warn('API database read failed, trying offline queue:', error);
                return this.getFromOfflineQueue(collection, query);
            }
        };
        
        api.saveToDatabase = async (collection, data) => {
            try {
                const result = await originalSaveToDatabase(collection, data);
                this.emit('data_saved', { collection, data });
                return result;
            } catch (error) {
                console.warn('API database save failed, adding to sync queue:', error);
                this.addToSyncQueue('save', collection, data);
                return false;
            }
        };
    }

    setupCrossServiceCommunication() {
        // Setup event bridges between services
        this.setupEventBridge();
        
        // Setup data synchronization
        this.setupDataSync();
        
        // Setup offline handling
        this.setupOfflineHandling();
    }

    setupEventBridge() {
        // Bridge events between services
        const events = [
            'user_action',
            'data_change',
            'error_occurred',
            'performance_metric',
            'sync_required'
        ];
        
        events.forEach(eventType => {
            this.on(eventType, (data) => {
                // Broadcast to all services
                this.broadcastToServices(eventType, data);
            });
        });
    }

    broadcastToServices(eventType, data) {
        // Send to analytics engine
        if (this.services.analyticsEngine && this.services.analyticsEngine.trackEvent) {
            this.services.analyticsEngine.trackEvent(`bridge_${eventType}`, data);
        }
        
        // Send to data collector
        if (this.services.dataCollector && this.services.dataCollector.trackEvent) {
            this.services.dataCollector.trackEvent(`bridge_${eventType}`, data);
        }
        
        // Log API event
        if (this.services.serverlessAPI) {
            console.log(`🔗 Event bridged: ${eventType}`, data);
        }
    }

    // ========================
    // DATA SYNCHRONIZATION
    // ========================

    setupDataSync() {
        // Monitor data changes
        this.monitorDataChanges();
        
        // Setup bidirectional sync
        this.setupBidirectionalSync();
        
        // Handle conflict resolution
        this.setupConflictResolution();
    }

    monitorDataChanges() {
        // Monitor app state changes
        if (window.appState && window.appState.subscribe) {
            window.appState.subscribe((state) => {
                this.handleStateChange(state);
            });
        }
        
        // Monitor local database changes
        // This would be implemented with database triggers in a real scenario
        setInterval(() => {
            this.checkForDatabaseChanges();
        }, 5000);
    }

    handleStateChange(state) {
        // Sync state changes to database and API
        this.addToSyncQueue('state_update', 'appState', state);
        
        // Emit event for other services
        this.emit('data_change', {
            type: 'app_state',
            data: state
        });
    }

    async checkForDatabaseChanges() {
        if (!this.services.localDB || !this.services.localDB.isReady) return;
        
        try {
            // Get recent changes (this is simplified)
            const recentChanges = await this.getRecentDatabaseChanges();
            
            if (recentChanges.length > 0) {
                this.emit('data_change', {
                    type: 'database',
                    changes: recentChanges
                });
            }
        } catch (error) {
            console.warn('Failed to check database changes:', error);
        }
    }

    async getRecentDatabaseChanges() {
        // This is a simplified implementation
        // In a real scenario, you'd track changes with timestamps
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        const changes = [];
        const collections = ['users', 'projects', 'products', 'ugcContent'];
        
        for (const collection of collections) {
            try {
                const items = await this.services.localDB.getAll(collection);
                const recentItems = items.filter(item => 
                    new Date(item.updatedAt || item.createdAt) > fiveMinutesAgo
                );
                
                if (recentItems.length > 0) {
                    changes.push({
                        collection,
                        items: recentItems,
                        count: recentItems.length
                    });
                }
            } catch (error) {
                console.warn(`Failed to check ${collection} changes:`, error);
            }
        }
        
        return changes;
    }

    setupBidirectionalSync() {
        // Sync from local to remote
        this.on('data_change', (data) => {
            if (data.type === 'database') {
                this.syncToRemote(data.changes);
            }
        });
        
        // Sync from remote to local (simulated)
        setInterval(() => {
            this.syncFromRemote();
        }, this.config.syncInterval);
    }

    async syncToRemote(changes) {
        if (this.offlineMode) {
            this.addToSyncQueue('remote_sync', 'changes', changes);
            return;
        }
        
        try {
            for (const change of changes) {
                await this.services.serverlessAPI.request('POST', '/api/sync/upload', {
                    collection: change.collection,
                    items: change.items
                });
            }
            
            console.log('📤 Synced', changes.length, 'changes to remote');
        } catch (error) {
            console.warn('Remote sync failed:', error);
            this.addToSyncQueue('remote_sync', 'changes', changes);
        }
    }

    async syncFromRemote() {
        if (this.offlineMode) return;
        
        try {
            // Check if serverless API is available
            if (!this.services.serverlessAPI) {
                console.warn('⚠️ ServerlessAPI not available, skipping remote sync');
                return;
            }

            const response = await this.services.serverlessAPI.request('GET', '/api/sync/download');
            
            if (response.status === 200 && response.data?.changes) {
                await this.applyRemoteChanges(response.data.changes);
                console.log('📥 Applied', response.data.changes.length, 'changes from remote');
            } else {
                console.log('📭 No remote changes to sync');
            }
        } catch (error) {
            // More detailed error handling
            if (error.message?.includes('Endpoint not found')) {
                console.warn('⚠️ Sync endpoint not configured, sync disabled');
            } else {
                console.warn('⚠️ Remote sync download failed:', error.message || error);
            }
        }
    }

    async applyRemoteChanges(changes) {
        if (!Array.isArray(changes)) {
            console.warn('⚠️ Invalid changes format:', typeof changes);
            return;
        }

        for (const change of changes) {
            try {
                if (!change || !change.collection || !change.data) {
                    console.warn('⚠️ Invalid change format:', change);
                    continue;
                }

                if (!this.services.localDB) {
                    console.warn('⚠️ LocalDB not available, cannot apply changes');
                    break;
                }

                await this.services.localDB.put(change.collection, change.data);
            } catch (error) {
                console.warn('⚠️ Failed to apply remote change:', error.message || error);
            }
        }
    }

    setupConflictResolution() {
        // Simple conflict resolution: last write wins
        // In a production system, you'd want more sophisticated conflict resolution
        this.on('sync_conflict', (conflict) => {
            console.warn('Sync conflict detected:', conflict);
            
            // For now, prefer remote data
            this.resolveConflict(conflict, 'remote');
        });
    }

    resolveConflict(conflict, strategy) {
        switch (strategy) {
            case 'remote':
                // Use remote data
                this.services.localDB.put(conflict.collection, conflict.remote);
                break;
            case 'local':
                // Keep local data
                this.addToSyncQueue('force_upload', conflict.collection, conflict.local);
                break;
            case 'merge':
                // Merge data (implementation depends on data structure)
                const merged = this.mergeData(conflict.local, conflict.remote);
                this.services.localDB.put(conflict.collection, merged);
                break;
        }
    }

    mergeData(local, remote) {
        // Simple merge strategy
        return {
            ...remote,
            ...local,
            updatedAt: new Date().toISOString()
        };
    }

    // ========================
    // OFFLINE HANDLING
    // ========================

    setupOfflineHandling() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.setOnlineMode();
        });
        
        window.addEventListener('offline', () => {
            this.setOfflineMode();
        });
        
        // Setup offline queue
        this.setupOfflineQueue();
    }

    setOnlineMode() {
        console.log('🌐 Back online - processing sync queue');
        this.offlineMode = false;
        this.processSyncQueue();
    }

    setOfflineMode() {
        console.log('📱 Offline mode activated');
        this.offlineMode = true;
    }

    setupOfflineQueue() {
        // Persist queue to localStorage
        this.loadSyncQueue();
        
        // Save queue periodically
        setInterval(() => {
            this.saveSyncQueue();
        }, 10000);
        
        // Process queue when online
        setInterval(() => {
            if (!this.offlineMode && this.syncQueue.length > 0) {
                this.processSyncQueue();
            }
        }, 5000);
    }

    addToSyncQueue(operation, collection, data) {
        if (this.syncQueue.length >= this.config.offlineQueueLimit) {
            console.warn('Sync queue limit reached, removing oldest items');
            this.syncQueue = this.syncQueue.slice(-Math.floor(this.config.offlineQueueLimit * 0.8));
        }
        
        this.syncQueue.push({
            id: this.generateId(),
            operation,
            collection,
            data,
            timestamp: new Date().toISOString(),
            attempts: 0,
            maxAttempts: this.config.retryAttempts
        });
        
        this.emit('sync_queued', { operation, collection });
    }

    async processSyncQueue() {
        if (this.offlineMode || this.syncQueue.length === 0) return;
        
        console.log(`🔄 Processing ${this.syncQueue.length} items in sync queue`);
        
        const itemsToProcess = [...this.syncQueue];
        this.syncQueue = [];
        
        for (const item of itemsToProcess) {
            try {
                await this.processSyncItem(item);
                console.log('✅ Synced:', item.operation, item.collection);
            } catch (error) {
                console.warn('❌ Sync failed:', error);
                
                item.attempts++;
                if (item.attempts < item.maxAttempts) {
                    this.syncQueue.push(item);
                } else {
                    console.error('Max sync attempts reached for item:', item);
                    this.emit('sync_failed', item);
                }
            }
        }
    }

    async processSyncItem(item) {
        switch (item.operation) {
            case 'save':
                return await this.services.localDB.put(item.collection, item.data);
            
            case 'state_update':
                if (window.appState) {
                    window.appState.setState(item.data);
                }
                return true;
            
            case 'remote_sync':
                return await this.syncToRemote(item.data);
            
            case 'force_upload':
                return await this.services.serverlessAPI.request('POST', `/api/${item.collection}`, item.data);
            
            default:
                throw new Error(`Unknown sync operation: ${item.operation}`);
        }
    }

    getFromOfflineQueue(collection, query) {
        // Search sync queue for items that match the query
        return this.syncQueue
            .filter(item => item.collection === collection && item.operation === 'save')
            .map(item => item.data)
            .filter(data => {
                // Simple query matching
                for (const [key, value] of Object.entries(query)) {
                    if (data[key] !== value) return false;
                }
                return true;
            });
    }

    loadSyncQueue() {
        try {
            const saved = localStorage.getItem('ugc_sync_queue');
            if (saved) {
                this.syncQueue = JSON.parse(saved);
                console.log(`📥 Loaded ${this.syncQueue.length} items from sync queue`);
            }
        } catch (error) {
            console.warn('Failed to load sync queue:', error);
            this.syncQueue = [];
        }
    }

    saveSyncQueue() {
        try {
            localStorage.setItem('ugc_sync_queue', JSON.stringify(this.syncQueue));
        } catch (error) {
            console.warn('Failed to save sync queue:', error);
        }
    }

    // ========================
    // BACKGROUND PROCESSES
    // ========================

    async startBackgroundProcesses() {
        // Health monitoring
        this.startHealthMonitoring();
        
        // Performance optimization
        this.startPerformanceOptimization();
        
        // Data cleanup
        this.startDataCleanup();
        
        // System metrics
        this.startSystemMetrics();
    }

    startHealthMonitoring() {
        setInterval(() => {
            this.checkSystemHealth();
        }, 60000); // Every minute
    }

    checkSystemHealth() {
        const health = {
            timestamp: new Date().toISOString(),
            services: {},
            memory: this.getMemoryUsage(),
            storage: this.getStorageUsage(),
            syncQueue: this.syncQueue.length,
            isOnline: !this.offlineMode
        };
        
        // Check each service
        for (const [name, service] of Object.entries(this.services)) {
            health.services[name] = {
                available: !!service,
                ready: service?.isReady || service?.isInitialized || true
            };
        }
        
        this.emit('health_check', health);
        
        // Log warnings if issues detected
        if (this.syncQueue.length > 100) {
            console.warn('⚠️ Large sync queue detected:', this.syncQueue.length, 'items');
        }
        
        if (health.memory && health.memory.percentage > 90) {
            console.warn('⚠️ High memory usage detected:', health.memory.percentage, '%');
        }
    }

    getMemoryUsage() {
        if (!performance.memory) return null;
        
        return {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit,
            percentage: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100)
        };
    }

    async getStorageUsage() {
        if (!navigator.storage || !navigator.storage.estimate) return null;
        
        try {
            const estimate = await navigator.storage.estimate();
            return {
                quota: estimate.quota,
                usage: estimate.usage,
                available: estimate.quota - estimate.usage,
                percentage: Math.round((estimate.usage / estimate.quota) * 100)
            };
        } catch (error) {
            return null;
        }
    }

    startPerformanceOptimization() {
        setInterval(() => {
            this.optimizePerformance();
        }, 300000); // Every 5 minutes
    }

    optimizePerformance() {
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Optimize cache sizes
        this.optimizeCaches();
        
        // Garbage collection hint
        if (window.gc) {
            window.gc();
        }
    }

    cleanupEventListeners() {
        // Remove inactive event listeners
        for (const [event, listeners] of this.eventListeners) {
            this.eventListeners.set(event, listeners.filter(listener => listener.active !== false));
        }
    }

    optimizeCaches() {
        // Optimize service caches
        if (this.services.serverlessAPI && this.services.serverlessAPI.cache) {
            const cacheSize = this.services.serverlessAPI.cache.size;
            if (cacheSize > 1000) {
                console.log('🧹 Cleaning API cache...');
                this.services.serverlessAPI.clearCache();
            }
        }
    }

    startDataCleanup() {
        setInterval(() => {
            this.cleanupOldData();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    async cleanupOldData() {
        console.log('🧹 Starting data cleanup...');
        
        // Clean old analytics data
        if (this.services.localDB) {
            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const oldAnalytics = await this.services.localDB.getAnalyticsByDateRange(new Date(0), thirtyDaysAgo);
                
                // Keep only last 1000 records
                const toDelete = oldAnalytics.slice(0, -1000);
                for (const item of toDelete) {
                    await this.services.localDB.delete('analytics', item.id);
                }
                
                console.log(`🧹 Cleaned ${toDelete.length} old analytics records`);
            } catch (error) {
                console.warn('Data cleanup failed:', error);
            }
        }
        
        // Clean old sync queue items
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        this.syncQueue = this.syncQueue.filter(item => 
            new Date(item.timestamp) > oneWeekAgo
        );
    }

    startSystemMetrics() {
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000); // Every 30 seconds
    }

    collectSystemMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            performance: {
                memory: this.getMemoryUsage(),
                timing: performance.timing ? {
                    loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
                    domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
                } : null
            },
            services: {
                dataCollector: {
                    events: this.services.dataCollector?.metrics?.events?.length || 0,
                    sessions: this.services.dataCollector?.metrics?.sessions?.length || 0
                },
                analytics: {
                    realTimeUsers: this.services.analyticsEngine?.getRealtimeMetrics?.()?.activeUsers || 0,
                    pageViews: this.services.analyticsEngine?.getRealtimeMetrics?.()?.pageViews || 0
                },
                api: {
                    endpoints: this.services.serverlessAPI?.endpoints?.size || 0,
                    requests: this.services.serverlessAPI?.requestLogs?.length || 0
                },
                database: {
                    ready: this.services.localDB?.isReady || false
                }
            },
            sync: {
                queueSize: this.syncQueue.length,
                isOnline: !this.offlineMode,
                lastSync: this.lastSyncTime
            }
        };
        
        this.emit('system_metrics', metrics);
    }

    // ========================
    // EVENT SYSTEM
    // ========================

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        
        const listener = { callback, active: true };
        this.eventListeners.get(event).push(listener);
        
        return () => {
            listener.active = false;
        };
    }

    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                if (listener.active) {
                    try {
                        listener.callback(data);
                    } catch (error) {
                        console.error('Event listener error:', error);
                    }
                }
            }
        }
    }

    // ========================
    // PUBLIC API
    // ========================

    getSystemStatus() {
        return {
            initialized: this.isInitialized,
            services: Object.keys(this.services).reduce((status, name) => {
                status[name] = {
                    connected: !!this.services[name],
                    ready: this.services[name]?.isReady || this.services[name]?.isInitialized || false
                };
                return status;
            }, {}),
            sync: {
                queueSize: this.syncQueue.length,
                isOnline: !this.offlineMode,
                lastSync: this.lastSyncTime
            },
            config: this.config
        };
    }

    async getFullSystemReport() {
        const status = this.getSystemStatus();
        const health = {
            memory: this.getMemoryUsage(),
            storage: await this.getStorageUsage()
        };
        
        const serviceStats = {};
        
        if (this.services.dataCollector) {
            serviceStats.dataCollector = this.services.dataCollector.getCollectionSummary();
        }
        
        if (this.services.analyticsEngine) {
            serviceStats.analytics = this.services.analyticsEngine.getRealtimeMetrics();
        }
        
        if (this.services.serverlessAPI) {
            serviceStats.api = this.services.serverlessAPI.getStats();
        }
        
        if (this.services.localDB) {
            serviceStats.database = await this.services.localDB.getDataSummary();
        }
        
        return {
            status,
            health,
            serviceStats,
            timestamp: new Date().toISOString()
        };
    }

    // ========================
    // UTILITY METHODS
    // ========================

    generateId() {
        return 'integrator_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================
    // SETUP INTEGRATIONS
    // ========================

    async setupIntegrations() {
        try {
            console.log('⚙️ Setting up service integrations...');
            
            // Verificar que los servicios estén disponibles
            if (!this.services || !this.services.dataCollector) {
                console.warn('Services not properly initialized, skipping integrations');
                return;
            }

            // Setup data collection integrations
            this.setupDataCollectionIntegrations();
            
            // Setup analytics integrations
            this.setupAnalyticsIntegrations();
            
            // Setup API integrations
            this.setupAPIIntegrations();
            
            // Setup cross-service events
            this.setupCrossServiceEvents();
            
            console.log('✅ Service integrations setup complete');
            
        } catch (error) {
            console.error('❌ Error setting up integrations:', error);
            // No throw para que no bloquee la inicialización
        }
    }

    setupDataCollectionIntegrations() {
        if (!this.services.dataCollector || !this.services.localDB) {
            console.warn('DataCollector or LocalDB not available for integration');
            return;
        }

        try {
            // Ya está configurado en connectDataCollectorToDatabase
            console.log('✅ Data collection integrations ready');
        } catch (error) {
            console.warn('Error in data collection integrations:', error);
        }
    }

    setupAnalyticsIntegrations() {
        if (!this.services.analyticsEngine) {
            console.warn('AnalyticsEngine not available for integration');
            return;
        }

        try {
            // Ya está configurado en connectAnalyticsToDataCollector
            console.log('✅ Analytics integrations ready');
        } catch (error) {
            console.warn('Error in analytics integrations:', error);
        }
    }

    setupAPIIntegrations() {
        if (!this.services.serverlessAPI) {
            console.warn('ServerlessAPI not available for integration');
            return;
        }

        try {
            // Ya está configurado en connectAPIToDatabase
            console.log('✅ API integrations ready');
        } catch (error) {
            console.warn('Error in API integrations:', error);
        }
    }

    setupCrossServiceEvents() {
        try {
            // Setup event forwarding between services
            this.on('error_occurred', (errorData) => {
                if (this.services.analyticsEngine && typeof this.services.analyticsEngine.track === 'function') {
                    this.services.analyticsEngine.track('error_occurred', errorData);
                }
                
                if (this.services.dataCollector && typeof this.services.dataCollector.trackEvent === 'function') {
                    this.services.dataCollector.trackEvent('system_error', errorData);
                }
            });

            this.on('performance_metric', (metricData) => {
                if (this.services.analyticsEngine && typeof this.services.analyticsEngine.track === 'function') {
                    this.services.analyticsEngine.track('performance_metric', metricData);
                }
            });

            console.log('✅ Cross-service events setup complete');
        } catch (error) {
            console.warn('Error setting up cross-service events:', error);
        }
    }

    async startBackgroundProcesses() {
        try {
            console.log('🔄 Starting background processes...');
            
            // Solo iniciar procesos si los servicios están disponibles
            if (this.services.analyticsEngine && typeof this.services.analyticsEngine.startProcessing === 'function') {
                this.services.analyticsEngine.startProcessing();
            }
            
            if (this.services.dataCollector && typeof this.services.dataCollector.startCollection === 'function') {
                this.services.dataCollector.startCollection();
            }
            
            console.log('✅ Background processes started');
            
        } catch (error) {
            console.error('❌ Error starting background processes:', error);
            // No throw para que no bloquee la inicialización
        }
    }
}

// Global instance
let backendIntegrator;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait a bit for other services to initialize
    setTimeout(async () => {
        try {
            backendIntegrator = new BackendIntegrator();
            window.backendIntegrator = backendIntegrator;
            
            // Setup global error handler
            window.addEventListener('error', (event) => {
                if (backendIntegrator) {
                    backendIntegrator.emit('error_occurred', {
                        message: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                        timestamp: new Date().toISOString()
                    });
                }
            });
            
            console.log('🔗 Backend Integrator ready');
            
        } catch (error) {
            console.error('❌ Failed to initialize Backend Integrator:', error);
        }
    }, 1000);
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackendIntegrator;
}


