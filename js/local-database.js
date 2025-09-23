// Local Database - Sistema de Control de Datos Local Avanzado
class LocalDatabase {
    constructor() {
        this.dbName = 'UGCStudioDB';
        this.version = 1;
        this.db = null;
        this.stores = {
            users: 'users',
            projects: 'projects',
            products: 'products',
            avatars: 'avatars',
            ugcContent: 'ugcContent',
            analytics: 'analytics',
            settings: 'settings',
            cache: 'cache',
            queue: 'queue'
        };
        
        this.isReady = false;
        this.pendingOperations = [];
        
        this.init();
    }

    async init() {
        try {
            await this.openDatabase();
            await this.initializeStores();
            await this.setupIndexes();
            await this.loadCachedData();
            
            this.isReady = true;
            await this.processPendingOperations();
            
            console.log('🗄️ LocalDatabase initialized successfully');
        } catch (error) {
            console.error('❌ LocalDatabase initialization failed:', error);
            this.fallbackToLocalStorage();
        }
    }

    // ========================
    // DATABASE SETUP
    // ========================

    openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }

            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };
        });
    }

    createStores(db) {
        // Users store
        if (!db.objectStoreNames.contains(this.stores.users)) {
            const userStore = db.createObjectStore(this.stores.users, { keyPath: 'id' });
            userStore.createIndex('email', 'email', { unique: true });
            userStore.createIndex('createdAt', 'createdAt');
        }

        // Projects store
        if (!db.objectStoreNames.contains(this.stores.projects)) {
            const projectStore = db.createObjectStore(this.stores.projects, { keyPath: 'id' });
            projectStore.createIndex('userId', 'userId');
            projectStore.createIndex('status', 'status');
            projectStore.createIndex('createdAt', 'createdAt');
            projectStore.createIndex('lastModified', 'lastModified');
        }

        // Products store
        if (!db.objectStoreNames.contains(this.stores.products)) {
            const productStore = db.createObjectStore(this.stores.products, { keyPath: 'id' });
            productStore.createIndex('userId', 'userId');
            productStore.createIndex('type', 'type');
            productStore.createIndex('status', 'status');
            productStore.createIndex('createdAt', 'createdAt');
        }

        // Avatars store
        if (!db.objectStoreNames.contains(this.stores.avatars)) {
            const avatarStore = db.createObjectStore(this.stores.avatars, { keyPath: 'id' });
            avatarStore.createIndex('userId', 'userId');
            avatarStore.createIndex('type', 'type');
            avatarStore.createIndex('status', 'status');
        }

        // UGC Content store
        if (!db.objectStoreNames.contains(this.stores.ugcContent)) {
            const ugcStore = db.createObjectStore(this.stores.ugcContent, { keyPath: 'id' });
            ugcStore.createIndex('projectId', 'projectId');
            ugcStore.createIndex('userId', 'userId');
            ugcStore.createIndex('status', 'status');
            ugcStore.createIndex('createdAt', 'createdAt');
            ugcStore.createIndex('styleId', 'styleId');
        }

        // Analytics store
        if (!db.objectStoreNames.contains(this.stores.analytics)) {
            const analyticsStore = db.createObjectStore(this.stores.analytics, { keyPath: 'id' });
            analyticsStore.createIndex('type', 'type');
            analyticsStore.createIndex('sessionId', 'sessionId');
            analyticsStore.createIndex('timestamp', 'timestamp');
            analyticsStore.createIndex('deviceId', 'deviceId');
        }

        // Settings store
        if (!db.objectStoreNames.contains(this.stores.settings)) {
            const settingsStore = db.createObjectStore(this.stores.settings, { keyPath: 'key' });
            settingsStore.createIndex('userId', 'userId');
            settingsStore.createIndex('category', 'category');
        }

        // Cache store
        if (!db.objectStoreNames.contains(this.stores.cache)) {
            const cacheStore = db.createObjectStore(this.stores.cache, { keyPath: 'key' });
            cacheStore.createIndex('expires', 'expires');
            cacheStore.createIndex('category', 'category');
        }

        // Queue store for offline operations
        if (!db.objectStoreNames.contains(this.stores.queue)) {
            const queueStore = db.createObjectStore(this.stores.queue, { keyPath: 'id' });
            queueStore.createIndex('priority', 'priority');
            queueStore.createIndex('createdAt', 'createdAt');
            queueStore.createIndex('type', 'type');
        }
    }

    async initializeStores() {
        // Initialize default settings
        await this.setDefaultSettings();
        
        // Clean expired cache
        await this.cleanExpiredCache();
        
        // Initialize sync queue
        await this.initializeSyncQueue();
    }

    async setupIndexes() {
        // Additional compound indexes can be added here if needed
        console.log('📊 Database indexes configured');
    }

    // ========================
    // CORE DATABASE OPERATIONS
    // ========================

    async get(storeName, key) {
        if (!this.isReady) {
            return this.queueOperation('get', storeName, key);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName, indexName = null, query = null) {
        if (!this.isReady) {
            return this.queueOperation('getAll', storeName, indexName, query);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let source = store;
            if (indexName) {
                source = store.index(indexName);
            }

            const request = source.getAll(query);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        if (!this.isReady) {
            return this.queueOperation('put', storeName, data);
        }

        // Add timestamps
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, data) {
        if (!this.isReady) {
            return this.queueOperation('add', storeName, data);
        }

        // Generate ID if not provided
        if (!data.id) {
            data.id = this.generateId();
        }

        data.createdAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(data.id);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        if (!this.isReady) {
            return this.queueOperation('delete', storeName, key);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async count(storeName, indexName = null, query = null) {
        if (!this.isReady) {
            return this.queueOperation('count', storeName, indexName, query);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let source = store;
            if (indexName) {
                source = store.index(indexName);
            }

            const request = source.count(query);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ========================
    // HIGH-LEVEL DATA OPERATIONS
    // ========================

    // User Management
    async saveUser(userData) {
        return await this.put(this.stores.users, userData);
    }

    async getUser(userId) {
        return await this.get(this.stores.users, userId);
    }

    async getUserByEmail(email) {
        const users = await this.getAll(this.stores.users, 'email', email);
        return users.length > 0 ? users[0] : null;
    }

    // Project Management
    async saveProject(projectData) {
        return await this.put(this.stores.projects, projectData);
    }

    async getProject(projectId) {
        return await this.get(this.stores.projects, projectId);
    }

    async getUserProjects(userId) {
        return await this.getAll(this.stores.projects, 'userId', userId);
    }

    async getActiveProjects(userId) {
        const allProjects = await this.getUserProjects(userId);
        return allProjects.filter(project => project.status === 'active');
    }

    // Product Management
    async saveProduct(productData) {
        return await this.put(this.stores.products, productData);
    }

    async getProduct(productId) {
        return await this.get(this.stores.products, productId);
    }

    async getUserProducts(userId) {
        return await this.getAll(this.stores.products, 'userId', userId);
    }

    // Avatar Management
    async saveAvatar(avatarData) {
        return await this.put(this.stores.avatars, avatarData);
    }

    async getAvatar(avatarId) {
        return await this.get(this.stores.avatars, avatarId);
    }

    async getUserAvatars(userId) {
        return await this.getAll(this.stores.avatars, 'userId', userId);
    }

    // UGC Content Management
    async saveUGCContent(ugcData) {
        return await this.put(this.stores.ugcContent, ugcData);
    }

    async getUGCContent(ugcId) {
        return await this.get(this.stores.ugcContent, ugcId);
    }

    async getProjectUGC(projectId) {
        return await this.getAll(this.stores.ugcContent, 'projectId', projectId);
    }

    async getUserUGC(userId) {
        return await this.getAll(this.stores.ugcContent, 'userId', userId);
    }

    // Analytics Management
    async saveAnalytics(analyticsData) {
        analyticsData.id = analyticsData.id || this.generateId();
        return await this.add(this.stores.analytics, analyticsData);
    }

    async getAnalyticsBySession(sessionId) {
        return await this.getAll(this.stores.analytics, 'sessionId', sessionId);
    }

    async getAnalyticsByDevice(deviceId) {
        return await this.getAll(this.stores.analytics, 'deviceId', deviceId);
    }

    async getAnalyticsByDateRange(startDate, endDate) {
        const allAnalytics = await this.getAll(this.stores.analytics);
        return allAnalytics.filter(item => {
            const timestamp = new Date(item.timestamp);
            return timestamp >= startDate && timestamp <= endDate;
        });
    }

    // ========================
    // CACHE MANAGEMENT
    // ========================

    async setCache(key, data, expirationMinutes = 60) {
        const cacheData = {
            key: key,
            data: data,
            expires: new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString(),
            category: 'general',
            createdAt: new Date().toISOString()
        };

        return await this.put(this.stores.cache, cacheData);
    }

    async getCache(key) {
        const cached = await this.get(this.stores.cache, key);
        
        if (!cached) return null;
        
        // Check if expired
        if (new Date(cached.expires) < new Date()) {
            await this.delete(this.stores.cache, key);
            return null;
        }
        
        return cached.data;
    }

    async clearCache(category = null) {
        if (category) {
            const cachedItems = await this.getAll(this.stores.cache, 'category', category);
            for (const item of cachedItems) {
                await this.delete(this.stores.cache, item.key);
            }
        } else {
            const transaction = this.db.transaction([this.stores.cache], 'readwrite');
            const store = transaction.objectStore(this.stores.cache);
            await store.clear();
        }
    }

    async cleanExpiredCache() {
        const allCached = await this.getAll(this.stores.cache);
        const now = new Date();
        
        for (const item of allCached) {
            if (new Date(item.expires) < now) {
                await this.delete(this.stores.cache, item.key);
            }
        }
    }

    // ========================
    // SETTINGS MANAGEMENT
    // ========================

    async setSetting(key, value, userId = null, category = 'general') {
        const settingData = {
            key: key,
            value: value,
            userId: userId,
            category: category,
            updatedAt: new Date().toISOString()
        };

        return await this.put(this.stores.settings, settingData);
    }

    async getSetting(key, defaultValue = null) {
        const setting = await this.get(this.stores.settings, key);
        return setting ? setting.value : defaultValue;
    }

    async getUserSettings(userId) {
        return await this.getAll(this.stores.settings, 'userId', userId);
    }

    async getSettingsByCategory(category) {
        return await this.getAll(this.stores.settings, 'category', category);
    }

    async setDefaultSettings() {
        const defaults = {
            'theme': 'dark',
            'language': 'es',
            'notifications': true,
            'analytics': true,
            'autoSave': true,
            'cacheExpiration': 60
        };

        for (const [key, value] of Object.entries(defaults)) {
            const existing = await this.getSetting(key);
            if (existing === null) {
                await this.setSetting(key, value, null, 'system');
            }
        }
    }

    // ========================
    // QUEUE MANAGEMENT
    // ========================

    async addToQueue(operation, data, priority = 1) {
        const queueItem = {
            id: this.generateId(),
            operation: operation,
            data: data,
            priority: priority,
            status: 'pending',
            createdAt: new Date().toISOString(),
            attempts: 0,
            maxAttempts: 3
        };

        return await this.add(this.stores.queue, queueItem);
    }

    async getQueueItems(status = null) {
        if (status) {
            const allItems = await this.getAll(this.stores.queue);
            return allItems.filter(item => item.status === status);
        }
        return await this.getAll(this.stores.queue);
    }

    async processQueue() {
        const pendingItems = await this.getQueueItems('pending');
        
        for (const item of pendingItems) {
            try {
                await this.processQueueItem(item);
                item.status = 'completed';
                item.completedAt = new Date().toISOString();
                await this.put(this.stores.queue, item);
            } catch (error) {
                item.attempts++;
                if (item.attempts >= item.maxAttempts) {
                    item.status = 'failed';
                    item.error = error.message;
                } else {
                    item.status = 'retry';
                }
                item.lastAttempt = new Date().toISOString();
                await this.put(this.stores.queue, item);
            }
        }
    }

    async processQueueItem(item) {
        const { operation, data } = item;
        
        switch (operation) {
            case 'syncUser':
                await this.saveUser(data);
                break;
            case 'syncProject':
                await this.saveProject(data);
                break;
            case 'syncUGC':
                await this.saveUGCContent(data);
                break;
            default:
                throw new Error(`Unknown queue operation: ${operation}`);
        }
    }

    async clearQueue(status = null) {
        const items = await this.getQueueItems(status);
        for (const item of items) {
            await this.delete(this.stores.queue, item.id);
        }
    }

    async initializeSyncQueue() {
        // Process any pending queue items
        await this.processQueue();
        
        // Set up periodic queue processing
        setInterval(() => {
            this.processQueue();
        }, 30000); // Every 30 seconds
    }

    // ========================
    // UTILITY METHODS
    // ========================

    generateId() {
        return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async queueOperation(operation, ...args) {
        this.pendingOperations.push({ operation, args });
        return new Promise(resolve => {
            this.pendingOperations[this.pendingOperations.length - 1].resolve = resolve;
        });
    }

    async processPendingOperations() {
        for (const pending of this.pendingOperations) {
            try {
                const result = await this[pending.operation](...pending.args);
                pending.resolve(result);
            } catch (error) {
                pending.resolve(null);
                console.error('Failed to process pending operation:', error);
            }
        }
        this.pendingOperations = [];
    }

    fallbackToLocalStorage() {
        console.warn('🔄 Falling back to localStorage');
        this.isReady = true;
        // Implement localStorage fallback methods here
    }

    // ========================
    // DATA EXPORT/IMPORT
    // ========================

    async exportAllData() {
        const data = {};
        
        for (const [name, storeName] of Object.entries(this.stores)) {
            try {
                data[name] = await this.getAll(storeName);
            } catch (error) {
                console.warn(`Failed to export ${name}:`, error);
                data[name] = [];
            }
        }
        
        return {
            version: this.version,
            exportedAt: new Date().toISOString(),
            data: data
        };
    }

    async importData(importData) {
        if (importData.version !== this.version) {
            throw new Error('Version mismatch');
        }
        
        for (const [storeName, items] of Object.entries(importData.data)) {
            if (this.stores[storeName]) {
                for (const item of items) {
                    await this.put(this.stores[storeName], item);
                }
            }
        }
        
        return true;
    }

    async clearAllData() {
        for (const storeName of Object.values(this.stores)) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await store.clear();
        }
        
        // Also clear localStorage backup
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith('ugc_')) {
                localStorage.removeItem(key);
            }
        }
    }

    // ========================
    // ANALYTICS HELPERS
    // ========================

    async getUsageStats() {
        const users = await this.getAll(this.stores.users);
        const projects = await this.getAll(this.stores.projects);
        const products = await this.getAll(this.stores.products);
        const ugcContent = await this.getAll(this.stores.ugcContent);
        const analytics = await this.getAll(this.stores.analytics);

        return {
            users: users.length,
            projects: projects.length,
            products: products.length,
            ugcContent: ugcContent.length,
            analyticsEvents: analytics.length,
            lastActivity: analytics.length > 0 ? 
                Math.max(...analytics.map(a => new Date(a.timestamp).getTime())) : null
        };
    }

    async getStorageUsage() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return null;
        }
        
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

    // ========================
    // PUBLIC API
    // ========================

    isReady() {
        return this.isReady;
    }

    getStats() {
        return this.getUsageStats();
    }

    async getDataSummary() {
        const stats = await this.getUsageStats();
        const storage = await this.getStorageUsage();
        
        return {
            database: {
                name: this.dbName,
                version: this.version,
                isReady: this.isReady
            },
            stats: stats,
            storage: storage,
            lastCacheClean: await this.getSetting('lastCacheClean'),
            queueItems: (await this.getQueueItems('pending')).length
        };
    }
}

// Global instance
let localDB;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    localDB = new LocalDatabase();
    window.localDB = localDB;
    
    console.log('🗄️ LocalDatabase instance created');
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocalDatabase;
}
