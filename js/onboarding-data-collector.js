/**
 * Onboarding Data Collector - Sistema Optimizado de Recolección
 * Maneja la recolección de datos del onboarding sin duplicados ni spam
 */

class OnboardingDataCollector {
    constructor() {
        this.formData = {};
        this.stepData = new Map();
        this.uploadedFiles = new Map();
        this.startTime = Date.now();
        this.stepStartTimes = new Map();
        this.stepCompletionTimes = new Map();
        this.isCollecting = false;
        
        // Configuración de tracking
        this.trackingConfig = {
            enableStepTracking: true,
            enableTimeTracking: true,
            enableValidationTracking: true,
            enableFileTracking: true,
            enableErrorTracking: true,
            throttleMs: 1000 // Mínimo tiempo entre eventos similares
        };
        
        this.lastEventTimes = new Map();
        this.init();
    }

    init() {
        console.log('📋 Onboarding Data Collector initialized');
        this.setupEventListeners();
        this.trackOnboardingStart();
    }

    setupEventListeners() {
        // Escuchar eventos del formulario de onboarding
        document.addEventListener('onboarding:step_start', (e) => {
            this.handleStepStart(e.detail);
        });
        
        document.addEventListener('onboarding:step_complete', (e) => {
            this.handleStepComplete(e.detail);
        });
        
        document.addEventListener('onboarding:data_change', (e) => {
            this.handleDataChange(e.detail);
        });
        
        document.addEventListener('onboarding:file_upload', (e) => {
            this.handleFileUpload(e.detail);
        });
        
        document.addEventListener('onboarding:validation_error', (e) => {
            this.handleValidationError(e.detail);
        });
        
        document.addEventListener('onboarding:completed', (e) => {
            this.handleOnboardingComplete(e.detail);
        });
    }

    // ========================
    // EVENT HANDLERS
    // ========================

    handleStepStart(detail) {
        const { step, section } = detail;
        
        if (!this.shouldTrackEvent('step_start', step)) return;
        
        this.stepStartTimes.set(step, Date.now());
        this.stepData.set(step, {
            section,
            startTime: Date.now(),
            attempts: (this.stepData.get(step)?.attempts || 0) + 1
        });
        
        this.trackEvent('onboarding_step_start', {
            step,
            section,
            timestamp: Date.now(),
            totalSteps: 33,
            attempts: this.stepData.get(step).attempts
        });
        
        this.updateLastEventTime('step_start', step);
    }

    handleStepComplete(detail) {
        const { step, section, data } = detail;
        
        if (!this.shouldTrackEvent('step_complete', step)) return;
        
        const startTime = this.stepStartTimes.get(step);
        const completionTime = Date.now();
        const timeSpent = startTime ? completionTime - startTime : 0;
        
        this.stepCompletionTimes.set(step, completionTime);
        
        // Actualizar datos del step
        const stepInfo = this.stepData.get(step) || {};
        stepInfo.completedAt = completionTime;
        stepInfo.timeSpent = timeSpent;
        stepInfo.data = data;
        this.stepData.set(step, stepInfo);
        
        // Actualizar formData
        if (data) {
            this.formData = { ...this.formData, ...data };
        }
        
        this.trackEvent('onboarding_step_complete', {
            step,
            section,
            timeSpent,
            totalTimeElapsed: completionTime - this.startTime,
            progressPercentage: (step / 33) * 100,
            dataFields: data ? Object.keys(data).length : 0
        });
        
        this.updateLastEventTime('step_complete', step);
        
        // Guardar progreso cada 5 pasos
        if (step % 5 === 0) {
            this.saveProgress();
        }
    }

    handleDataChange(detail) {
        const { field, value, step, isValid } = detail;
        
        if (!this.shouldTrackEvent('data_change', field)) return;
        
        // Actualizar formData
        this.formData[field] = value;
        
        // Solo trackear cambios significativos
        if (value && value.toString().length > 2) {
            this.trackEvent('onboarding_field_change', {
                field,
                step,
                valueLength: value.toString().length,
                isValid,
                timestamp: Date.now()
            });
        }
        
        this.updateLastEventTime('data_change', field);
    }

    handleFileUpload(detail) {
        const { field, file, step, success } = detail;
        
        if (success && file) {
            this.uploadedFiles.set(field, {
                file,
                uploadedAt: Date.now(),
                step,
                size: file.size,
                type: file.type,
                name: file.name
            });
        }
        
        this.trackEvent('onboarding_file_upload', {
            field,
            step,
            success,
            fileSize: file?.size || 0,
            fileType: file?.type || 'unknown',
            totalFiles: this.uploadedFiles.size
        });
    }

    handleValidationError(detail) {
        const { step, field, error, value } = detail;
        
        this.trackEvent('onboarding_validation_error', {
            step,
            field,
            error,
            valueLength: value?.toString()?.length || 0,
            timestamp: Date.now()
        });
    }

    handleOnboardingComplete(detail) {
        const { skipped, completedSteps } = detail;
        const totalTime = Date.now() - this.startTime;
        
        this.trackEvent('onboarding_completed', {
            skipped,
            completedSteps,
            totalSteps: 33,
            totalTime,
            completionRate: (completedSteps / 33) * 100,
            filesUploaded: this.uploadedFiles.size,
            formFieldsCompleted: Object.keys(this.formData).length,
            averageStepTime: totalTime / completedSteps
        });
        
        // Guardar datos finales
        this.saveOnboardingData();
    }

    // ========================
    // TRACKING LOGIC
    // ========================

    shouldTrackEvent(eventType, identifier) {
        const key = `${eventType}_${identifier}`;
        const lastTime = this.lastEventTimes.get(key) || 0;
        const now = Date.now();
        
        return now - lastTime >= this.trackingConfig.throttleMs;
    }

    updateLastEventTime(eventType, identifier) {
        const key = `${eventType}_${identifier}`;
        this.lastEventTimes.set(key, Date.now());
    }

    trackEvent(eventType, data) {
        if (!window.analyticsEngine || !this.trackingConfig.enableStepTracking) return;
        
        try {
            if (typeof window.analyticsEngine.track === 'function') {
                window.analyticsEngine.track(eventType, {
                    ...data,
                    sessionId: this.getSessionId(),
                    onboardingId: this.getOnboardingId(),
                    userAgent: navigator.userAgent,
                    viewport: `${window.innerWidth}x${window.innerHeight}`
                });
            }
        } catch (error) {
            console.warn('Error tracking onboarding event:', error);
        }
    }

    trackOnboardingStart() {
        this.trackEvent('onboarding_started', {
            timestamp: this.startTime,
            userAgent: navigator.userAgent,
            referrer: document.referrer,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language
        });
    }

    // ========================
    // DATA MANAGEMENT
    // ========================

    saveProgress() {
        const progressData = {
            formData: this.formData,
            stepData: Object.fromEntries(this.stepData),
            uploadedFiles: Array.from(this.uploadedFiles.entries()),
            lastSaved: Date.now(),
            sessionId: this.getSessionId()
        };
        
        try {
            localStorage.setItem('onboarding_progress', JSON.stringify(progressData));
            console.log('📋 Onboarding progress saved');
        } catch (error) {
            console.warn('Error saving onboarding progress:', error);
        }
    }

    async saveOnboardingData() {
        const finalData = {
            formData: this.formData,
            stepData: Object.fromEntries(this.stepData),
            uploadedFiles: Array.from(this.uploadedFiles.entries()),
            startTime: this.startTime,
            completedAt: Date.now(),
            totalTime: Date.now() - this.startTime,
            sessionId: this.getSessionId(),
            onboardingId: this.getOnboardingId(),
            version: '2.0.0'
        };
        
        try {
            // Guardar en localStorage
            localStorage.setItem('ugc_onboarding_data', JSON.stringify(finalData));
            
            // Guardar en localDB si está disponible
            if (window.localDB && window.localDB.isReady) {
                await window.localDB.saveOnboardingData(finalData);
            }
            
            // Intentar guardar en Supabase
            if (window.supabaseClient?.isReady()) {
                await this.saveToSupabase(finalData);
            }
            
            console.log('📋 Onboarding data saved successfully');
            return finalData;
            
        } catch (error) {
            console.error('Error saving onboarding data:', error);
            throw error;
        }
    }

    async saveToSupabase(data) {
        try {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
            if (!currentUser.id) {
                console.warn('No user ID found for Supabase save');
                return;
            }
            
            await window.supabaseClient.saveOnboardingData(currentUser.id, data.formData);
            console.log('📋 Data synced to Supabase');
            
        } catch (error) {
            console.warn('Failed to save to Supabase:', error);
        }
    }

    // ========================
    // UTILITY METHODS
    // ========================

    getSessionId() {
        return sessionStorage.getItem('sessionId') || 
               localStorage.getItem('sessionId') || 
               'session_' + Date.now();
    }

    getOnboardingId() {
        if (!this.onboardingId) {
            this.onboardingId = 'onboarding_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return this.onboardingId;
    }

    getCurrentData() {
        return {
            formData: this.formData,
            stepData: Object.fromEntries(this.stepData),
            uploadedFiles: Array.from(this.uploadedFiles.entries()),
            progress: {
                completedSteps: this.stepData.size,
                totalSteps: 33,
                completionRate: (this.stepData.size / 33) * 100,
                timeElapsed: Date.now() - this.startTime
            }
        };
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('onboarding_progress');
            if (saved) {
                const data = JSON.parse(saved);
                this.formData = data.formData || {};
                this.stepData = new Map(Object.entries(data.stepData || {}));
                this.uploadedFiles = new Map(data.uploadedFiles || []);
                console.log('📋 Onboarding progress loaded');
                return true;
            }
        } catch (error) {
            console.warn('Error loading onboarding progress:', error);
        }
        return false;
    }

    clearProgress() {
        localStorage.removeItem('onboarding_progress');
        this.formData = {};
        this.stepData.clear();
        this.uploadedFiles.clear();
        console.log('📋 Onboarding progress cleared');
    }

    // ========================
    // PUBLIC API
    // ========================

    updateData(field, value, step) {
        this.formData[field] = value;
        
        // Disparar evento de cambio de datos
        document.dispatchEvent(new CustomEvent('onboarding:data_change', {
            detail: { field, value, step, isValid: this.validateField(field, value) }
        }));
    }

    validateField(field, value) {
        // Validaciones básicas
        if (!value) return false;
        
        switch (field) {
            case 'nombre_completo':
                return value.length >= 2;
            case 'email':
                return /\S+@\S+\.\S+/.test(value);
            case 'precio_producto':
                return !isNaN(parseFloat(value)) && parseFloat(value) > 0;
            default:
                return value.toString().length > 0;
        }
    }

    getProgress() {
        return {
            completedSteps: this.stepData.size,
            totalSteps: 33,
            percentage: (this.stepData.size / 33) * 100,
            timeElapsed: Date.now() - this.startTime,
            formFields: Object.keys(this.formData).length,
            filesUploaded: this.uploadedFiles.size
        };
    }
}

// Instancia global
window.onboardingDataCollector = new OnboardingDataCollector();

console.log('📋 Onboarding Data Collector module loaded');
