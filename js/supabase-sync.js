/**
 * UGC Studio - Supabase Sync Manager
 * Sistema de sincronización bidireccional entre IndexedDB local y Supabase
 * 
 * Funcionalidades:
 * - Sincronización automática de datos
 * - Resolución de conflictos
 * - Modo offline con cola de sincronización
 * - Sincronización diferencial (solo cambios)
 * - Monitoreo de estado de conexión
 */

class SupabaseSync {
    constructor() {
        this.syncInterval = 30000; // 30 segundos
        this.syncTimer = null;
        this.isSyncing = false;
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.lastSyncTimestamp = null;
        this.currentUser = null;
        this.conflicts = [];
        
        this.init();
    }

    async init() {
        try {
            // Esperar a que los servicios estén listos
            const servicesReady = await this.waitForServices();
            
            // Configurar listeners
            this.setupNetworkListeners();
            await this.setupUserListener();
            
            // Solo cargar sincronización si hay servicios disponibles
            if (servicesReady) {
                this.loadLastSyncTimestamp();
            }
            
            // Iniciar sincronización automática
            this.startAutoSync();

            console.log('🔄 Supabase Sync Manager inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando Sync Manager:', error);
            // No relanzar el error para que no bloquee la aplicación
        }
    }

    async waitForServices() {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            // Verificar servicios mínimos requeridos
            const supabaseReady = window.supabaseClient?.isReady?.() || false;
            const localDbReady = window.localDatabase?.isReady?.() || false;
            const analyticsReady = window.analyticsEngine !== undefined;
            
            if (supabaseReady || localDbReady) {
                // Al menos uno de los sistemas de datos está disponible
                console.log(`✅ Servicios disponibles (intento ${attempts + 1}/${maxAttempts}):`, {
                    supabase: supabaseReady,
                    localDb: localDbReady,
                    analytics: analyticsReady
                });
                return true;
            }
            
            attempts++;
            console.log(`⏳ Esperando servicios (intento ${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // En lugar de lanzar error, log y continuar
        console.warn('⚠️ Algunos servicios no están disponibles, continuando con funcionalidad limitada');
        return false; // No throw, devolver false
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            console.log('🌐 Conexión restaurada - iniciando sincronización');
            this.isOnline = true;
            this.triggerSync();
        });

        window.addEventListener('offline', () => {
            console.log('📴 Conexión perdida - modo offline activado');
            this.isOnline = false;
        });
    }

    async setupUserListener() {
        // Intentar obtener usuario actual primero
        try {
            if (window.supabaseClient && window.supabaseClient.isReady()) {
                const currentUser = await window.supabaseClient.getCurrentUser();
                if (currentUser) {
                    this.currentUser = currentUser;
                    console.log('👤 Usuario actual detectado para sync:', currentUser.id);
                }
            }
        } catch (error) {
            console.warn('⚠️ No se pudo obtener usuario actual para sync:', error);
        }

        // Escuchar cambios de usuario
        window.addEventListener('supabaseAuthChange', (event) => {
            const { user } = event.detail;
            if (user && user.id !== this.currentUser?.id) {
                this.currentUser = user;
                console.log('👤 Usuario cambiado en sync:', user.id);
                this.triggerSync();
            }
        });

        // Escuchar cambios de AppState
        if (window.AppState) {
            window.AppState.subscribe('user', (user) => {
                if (user && user.id !== this.currentUser?.id) {
                    this.currentUser = user;
                    console.log('👤 Usuario actualizado desde AppState:', user.id);
                    this.triggerSync();
                }
            });
        }
    }

    startAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }

        this.syncTimer = setInterval(() => {
            if (this.isOnline && this.currentUser && !this.isSyncing) {
                this.triggerSync();
            }
        }, this.syncInterval);
    }

    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    async triggerSync() {
        if (this.isSyncing || !this.currentUser) {
            return;
        }

        try {
            this.isSyncing = true;
            console.log('🔄 Iniciando sincronización...');
            
            const syncResult = await this.performSync();
            
            this.lastSyncTimestamp = Date.now();
            this.saveLastSyncTimestamp();
            
            console.log('✅ Sincronización completada:', syncResult);
            
            // Notificar resultado
            this.notifySyncResult(syncResult);
            
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
            this.notifySyncError(error);
        } finally {
            this.isSyncing = false;
        }
    }

    async performSync() {
        const result = {
            uploaded: 0,
            downloaded: 0,
            conflicts: 0,
            errors: []
        };

        try {
            // 1. Subir cambios locales pendientes
            const uploadResult = await this.uploadLocalChanges();
            result.uploaded = uploadResult.count;
            result.errors.push(...uploadResult.errors);

            // 2. Descargar cambios remotos
            const downloadResult = await this.downloadRemoteChanges();
            result.downloaded = downloadResult.count;
            result.conflicts = downloadResult.conflicts;
            result.errors.push(...downloadResult.errors);

            // 3. Procesar operaciones pendientes
            if (this.pendingOperations.length > 0) {
                const pendingResult = await this.processPendingOperations();
                result.uploaded += pendingResult.count;
                result.errors.push(...pendingResult.errors);
            }

            return result;

        } catch (error) {
            result.errors.push(error.message);
            throw error;
        }
    }

    async uploadLocalChanges() {
        const result = { count: 0, errors: [] };
        
        if (!this.isOnline || !window.supabaseClient?.isReady()) {
            return result;
        }

        try {
            // Obtener datos locales que necesitan sincronización
            const localData = await this.getLocalDataForSync();
            
            for (const [table, records] of Object.entries(localData)) {
                try {
                    for (const record of records) {
                        await this.uploadRecord(table, record);
                        result.count++;
                    }
                } catch (error) {
                    result.errors.push(`Error subiendo ${table}: ${error.message}`);
                }
            }

        } catch (error) {
            result.errors.push(`Error obteniendo datos locales: ${error.message}`);
        }

        return result;
    }

    async getLocalDataForSync() {
        const localData = {};
        const tables = ['projects', 'products', 'avatars'];
        
        // Verificar que localDatabase esté disponible
        if (!window.localDatabase || typeof window.localDatabase.getUnsyncedRecords !== 'function') {
            // No mostrar warning si localDatabase no está disponible
            return localData;
        }
        
        for (const table of tables) {
            try {
                const userId = this.currentUser?.id;
                if (!userId) {
                    console.warn(`Usuario no definido para obtener registros de ${table}`);
                    continue;
                }
                const records = await window.localDatabase.getUnsyncedRecords(table, userId);
                if (records && records.length > 0) {
                    localData[table] = records;
                }
            } catch (error) {
                console.error(`Error obteniendo ${table} locales:`, error);
            }
        }

        return localData;
    }

    async uploadLocalChanges() {
        const result = { count: 0, errors: [] };
        
        // Verificar condiciones mínimas para upload
        if (!this.currentUser?.id) {
            console.warn('⚠️ No hay usuario para upload - saltando');
            return result;
        }

        if (!window.supabaseClient?.isReady?.()) {
            console.warn('⚠️ Supabase no está listo para upload - saltando');
            return result;
        }
        
        try {
            const localData = await this.getLocalDataForSync();
            
            if (Object.keys(localData).length === 0) {
                console.log('📝 No hay datos locales para sincronizar');
                return result;
            }
            
            for (const [table, records] of Object.entries(localData)) {
                if (!Array.isArray(records)) {
                    console.warn(`⚠️ Datos inválidos para tabla ${table}`);
                    continue;
                }
                
                for (const record of records) {
                    try {
                        if (!record || !record.id) {
                            console.warn(`⚠️ Registro inválido en tabla ${table}`);
                            continue;
                        }
                        await this.uploadRecord(table, record);
                        result.count++;
                    } catch (error) {
                        result.errors.push(`Error subiendo ${table}:${record.id}: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            result.errors.push(`Error en upload batch: ${error.message}`);
        }

        return result;
    }

    async downloadRemoteChanges() {
        const result = { count: 0, conflicts: [], errors: [] };
        
        // Verificar condiciones mínimas para download
        if (!this.currentUser?.id) {
            console.warn('⚠️ No hay usuario para download - saltando');
            return result;
        }

        if (!window.supabaseClient?.isReady?.()) {
            console.warn('⚠️ Supabase no está listo para download - saltando');
            return result;
        }
        
        try {
            // Implementar lógica de descarga aquí
            console.log('📥 Descargando cambios remotos...');
            
        } catch (error) {
            result.errors.push(`Error en download batch: ${error.message}`);
        }

        return result;
    }

    async processPendingOperations() {
        const result = { count: 0, errors: [] };
        
        try {
            const pending = [...this.pendingOperations];
            this.pendingOperations = [];
            
            for (const operation of pending) {
                try {
                    // Procesar operación pendiente
                    result.count++;
                } catch (error) {
                    result.errors.push(`Error procesando operación pendiente: ${error.message}`);
                    // Re-agregar a pendientes si falla
                    this.pendingOperations.push(operation);
                }
            }
        } catch (error) {
            result.errors.push(`Error procesando operaciones pendientes: ${error.message}`);
        }

        return result;
    }

    async uploadRecord(table, record) {
        try {
            let supabaseRecord = {
                ...record,
                user_id: this.currentUser.id,
                updated_at: new Date().toISOString()
            };

            // Remover campos locales
            delete supabaseRecord.local_id;
            delete supabaseRecord.needs_sync;
            delete supabaseRecord.last_sync;

            let result;
            
            if (record.supabase_id) {
                // Actualizar registro existente
                result = await window.supabaseClient.getClient()
                    .from(table)
                    .update(supabaseRecord)
                    .eq('id', record.supabase_id)
                    .select()
                    .single();
            } else {
                // Crear nuevo registro
                result = await window.supabaseClient.getClient()
                    .from(table)
                    .insert(supabaseRecord)
                    .select()
                    .single();
            }

            if (result.error) throw result.error;

            // Actualizar registro local con ID de Supabase
            await window.localDatabase.updateSyncStatus(table, record.local_id, {
                supabase_id: result.data.id,
                needs_sync: false,
                last_sync: Date.now()
            });

            console.log(`✅ ${table} subido:`, result.data.id);

        } catch (error) {
            console.error(`❌ Error subiendo ${table}:`, error);
            throw error;
        }
    }

    async downloadRemoteChanges() {
        const result = { count: 0, conflicts: 0, errors: [] };
        
        if (!this.isOnline || !window.supabaseClient?.isReady()) {
            return result;
        }

        const tables = ['projects', 'products', 'avatars'];
        
        for (const table of tables) {
            try {
                const changes = await this.getRemoteChanges(table);
                
                for (const remoteRecord of changes) {
                    const syncResult = await this.syncRemoteRecord(table, remoteRecord);
                    
                    if (syncResult.conflict) {
                        result.conflicts++;
                        this.conflicts.push({
                            table,
                            record: remoteRecord,
                            local: syncResult.localRecord,
                            timestamp: Date.now()
                        });
                    } else {
                        result.count++;
                    }
                }

            } catch (error) {
                result.errors.push(`Error descargando ${table}: ${error.message}`);
            }
        }

        return result;
    }

    async getRemoteChanges(table) {
        const query = window.supabaseClient.getClient()
            .from(table)
            .select('*')
            .eq('user_id', this.currentUser.id);

        // Solo obtener cambios desde la última sincronización
        if (this.lastSyncTimestamp) {
            query.gte('updated_at', new Date(this.lastSyncTimestamp).toISOString());
        }

        const { data, error } = await query;
        
        if (error) throw error;
        return data || [];
    }

    async syncRemoteRecord(table, remoteRecord) {
        try {
            // Buscar registro local correspondiente
            const localRecord = await window.localDatabase.findBySupabaseId(table, remoteRecord.id);
            
            if (!localRecord) {
                // Nuevo registro remoto - crear localmente
                await window.localDatabase.createFromRemote(table, remoteRecord);
                return { conflict: false };
            }

            // Verificar conflictos
            const remoteTime = new Date(remoteRecord.updated_at).getTime();
            const localTime = localRecord.last_modified || localRecord.updated_at;
            
            if (localRecord.needs_sync && localTime > remoteTime) {
                // Conflicto: cambio local más reciente que remoto
                return { conflict: true, localRecord };
            }

            // Actualizar registro local con datos remotos
            await window.localDatabase.updateFromRemote(table, localRecord.local_id, remoteRecord);
            return { conflict: false };

        } catch (error) {
            console.error(`Error sincronizando ${table}:`, error);
            throw error;
        }
    }

    async processPendingOperations() {
        const result = { count: 0, errors: [] };
        
        if (!this.isOnline || this.pendingOperations.length === 0) {
            return result;
        }

        const operations = [...this.pendingOperations];
        this.pendingOperations = [];

        for (const operation of operations) {
            try {
                await this.executeOperation(operation);
                result.count++;
            } catch (error) {
                result.errors.push(`Error en operación ${operation.type}: ${error.message}`);
                // Volver a añadir a la cola si falla
                this.pendingOperations.push(operation);
            }
        }

        return result;
    }

    async executeOperation(operation) {
        const { type, table, data, id } = operation;
        
        switch (type) {
            case 'create':
                return window.supabaseClient.getClient()
                    .from(table)
                    .insert(data);
                    
            case 'update':
                return window.supabaseClient.getClient()
                    .from(table)
                    .update(data)
                    .eq('id', id);
                    
            case 'delete':
                return window.supabaseClient.getClient()
                    .from(table)
                    .delete()
                    .eq('id', id);
                    
            default:
                throw new Error(`Tipo de operación no válido: ${type}`);
        }
    }

    // Métodos para añadir operaciones a la cola
    queueCreate(table, data) {
        this.pendingOperations.push({
            type: 'create',
            table,
            data: { ...data, user_id: this.currentUser?.id },
            timestamp: Date.now()
        });
        
        if (this.isOnline) {
            this.triggerSync();
        }
    }

    queueUpdate(table, id, data) {
        this.pendingOperations.push({
            type: 'update',
            table,
            id,
            data,
            timestamp: Date.now()
        });
        
        if (this.isOnline) {
            this.triggerSync();
        }
    }

    queueDelete(table, id) {
        this.pendingOperations.push({
            type: 'delete',
            table,
            id,
            timestamp: Date.now()
        });
        
        if (this.isOnline) {
            this.triggerSync();
        }
    }

    // Resolución de conflictos
    async resolveConflict(conflictId, resolution) {
        const conflict = this.conflicts.find(c => c.timestamp === conflictId);
        if (!conflict) return;

        try {
            if (resolution === 'local') {
                // Usar versión local
                await this.uploadRecord(conflict.table, conflict.local);
            } else if (resolution === 'remote') {
                // Usar versión remota
                await window.localDatabase.updateFromRemote(
                    conflict.table, 
                    conflict.local.local_id, 
                    conflict.record
                );
            }

            // Remover conflicto resuelto
            this.conflicts = this.conflicts.filter(c => c.timestamp !== conflictId);
            
        } catch (error) {
            console.error('Error resolviendo conflicto:', error);
            throw error;
        }
    }

    // Persistencia de timestamp
    loadLastSyncTimestamp() {
        const stored = localStorage.getItem('ugc_last_sync');
        if (stored) {
            this.lastSyncTimestamp = parseInt(stored, 10);
        }
    }

    saveLastSyncTimestamp() {
        localStorage.setItem('ugc_last_sync', this.lastSyncTimestamp.toString());
    }

    // Notificaciones
    notifySyncResult(result) {
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('sync_completed', {
                    uploaded: result.uploaded,
                    downloaded: result.downloaded,
                    conflicts: result.conflicts,
                    errors: result.errors.length
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (sync_completed):', error);
        }

        // Enviar evento personalizado
        window.dispatchEvent(new CustomEvent('syncCompleted', {
            detail: result
        }));
    }

    notifySyncError(error) {
        try {
            if (window.analyticsEngine && typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track('sync_error', {
                    error: error.message
                });
            }
        } catch (error) {
            console.warn('⚠️ Error en analytics tracking (sync_error):', error);
        }

        window.dispatchEvent(new CustomEvent('syncError', {
            detail: { error: error.message }
        }));
    }

    // API pública
    getSyncStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            lastSync: this.lastSyncTimestamp,
            pendingOperations: this.pendingOperations.length,
            conflicts: this.conflicts.length,
            currentUser: this.currentUser?.id
        };
    }

    getConflicts() {
        return this.conflicts;
    }

    async forcSync() {
        return this.triggerSync();
    }

    pauseSync() {
        this.stopAutoSync();
    }

    resumeSync() {
        this.startAutoSync();
    }

    destroy() {
        this.stopAutoSync();
        window.removeEventListener('online', this.onOnline);
        window.removeEventListener('offline', this.onOffline);
    }
}

// Inicializar Sync Manager global
window.supabaseSync = new SupabaseSync();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseSync;
}

console.log('🔄 Supabase Sync Manager loaded');
