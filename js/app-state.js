// Global Application State Manager
class AppState {
    constructor() {
        this.state = {
            user: null,
            isAuthenticated: false,
            currentPlan: null,
            onboardingData: null,
            projects: [],
            ugcHistory: [],
            selectedStyles: new Set(),
            currentProject: null,
            aiModels: {
                veo3: { available: true, usage: 0, limit: 100 },
                nanoBanana: { available: true, usage: 0, limit: 100 },
                seedream: { available: true, usage: 0, limit: 100 }
            },
            settings: {
                theme: 'dark',
                language: 'es',
                notifications: true,
                autoSave: true
            }
        };
        
        this.subscribers = new Set();
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.setupStorageSync();
    }

    // State management
    setState(updates) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...updates };
        
        // Auto-save to storage
        this.saveToStorage();
        
        // Notify subscribers
        this.notifySubscribers(prevState, this.state);
    }

    getState() {
        return { ...this.state };
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    notifySubscribers(prevState, newState) {
        this.subscribers.forEach(callback => {
            try {
                callback(newState, prevState);
            } catch (error) {
                console.error('Error in state subscriber:', error);
            }
        });
    }

    // Storage management
    saveToStorage() {
        try {
            localStorage.setItem('ugc_app_state', JSON.stringify({
                user: this.state.user,
                isAuthenticated: this.state.isAuthenticated,
                currentPlan: this.state.currentPlan,
                onboardingData: this.state.onboardingData,
                projects: this.state.projects,
                ugcHistory: this.state.ugcHistory,
                settings: this.state.settings,
                selectedStyles: Array.from(this.state.selectedStyles),
                aiModels: this.state.aiModels,
                lastUpdate: new Date().toISOString()
            }));
        } catch (error) {
            console.error('Error saving state to storage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('ugc_app_state');
            if (stored) {
                const data = JSON.parse(stored);
                this.state = {
                    ...this.state,
                    ...data,
                    selectedStyles: new Set(data.selectedStyles || [])
                };
                
                // Validate user session (simulate token expiry)
                if (this.state.isAuthenticated && data.lastUpdate) {
                    const lastUpdate = new Date(data.lastUpdate);
                    const daysSinceUpdate = (new Date() - lastUpdate) / (1000 * 60 * 60 * 24);
                    
                    if (daysSinceUpdate > 30) {
                        // Session expired
                        this.logout();
                    }
                }
            }
        } catch (error) {
            console.error('Error loading state from storage:', error);
        }
    }

    setupStorageSync() {
        // Listen for storage changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'ugc_app_state' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    this.state = {
                        ...this.state,
                        ...data,
                        selectedStyles: new Set(data.selectedStyles || [])
                    };
                    this.notifySubscribers({}, this.state);
                } catch (error) {
                    console.error('Error syncing state from storage:', error);
                }
            }
        });
    }

    // Authentication methods
    login(userData) {
        this.setState({
            user: userData,
            isAuthenticated: true,
            currentPlan: userData.plan || 'pro'
        });
    }

    logout() {
        this.setState({
            user: null,
            isAuthenticated: false,
            currentPlan: null,
            selectedStyles: new Set()
        });
        
        // Clear sensitive data
        localStorage.removeItem('ugc_user_session');
    }

    // Project management
    createProject(projectData) {
        const project = {
            id: this.generateId(),
            ...projectData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active'
        };

        const projects = [...this.state.projects, project];
        this.setState({ projects, currentProject: project });
        
        return project;
    }

    updateProject(projectId, updates) {
        const projects = this.state.projects.map(p => 
            p.id === projectId 
                ? { ...p, ...updates, updatedAt: new Date().toISOString() }
                : p
        );
        
        const currentProject = this.state.currentProject?.id === projectId
            ? { ...this.state.currentProject, ...updates }
            : this.state.currentProject;

        this.setState({ projects, currentProject });
    }

    deleteProject(projectId) {
        const projects = this.state.projects.filter(p => p.id !== projectId);
        const currentProject = this.state.currentProject?.id === projectId 
            ? null 
            : this.state.currentProject;

        this.setState({ projects, currentProject });
    }

    setCurrentProject(projectId) {
        const project = this.state.projects.find(p => p.id === projectId);
        this.setState({ currentProject: project || null });
    }

    // UGC History management
    addUGCGeneration(ugcData) {
        const ugc = {
            id: this.generateId(),
            ...ugcData,
            timestamp: new Date().toISOString(),
            projectId: this.state.currentProject?.id,
            status: 'generated'
        };

        const ugcHistory = [ugc, ...this.state.ugcHistory];
        this.setState({ ugcHistory });
        
        // Update AI model usage
        this.updateAIUsage(ugcData.modelsUsed || []);
        
        return ugc;
    }

    updateAIUsage(modelsUsed) {
        const aiModels = { ...this.state.aiModels };
        
        modelsUsed.forEach(model => {
            if (aiModels[model]) {
                aiModels[model].usage += 1;
            }
        });

        this.setState({ aiModels });
    }

    // Style management
    toggleStyleSelection(styleId) {
        const selectedStyles = new Set(this.state.selectedStyles);
        
        if (selectedStyles.has(styleId)) {
            selectedStyles.delete(styleId);
        } else {
            selectedStyles.add(styleId);
        }
        
        this.setState({ selectedStyles });
    }

    clearSelectedStyles() {
        this.setState({ selectedStyles: new Set() });
    }

    // Onboarding data
    setOnboardingData(data) {
        this.setState({ onboardingData: data });
        
        // Auto-create first project from onboarding data
        if (data && !this.state.currentProject) {
            const project = this.createProject({
                name: data.nombre_marca || 'Mi Proyecto',
                brand: {
                    name: data.nombre_marca,
                    website: data.sitio_web,
                    tone: data.tono_voz,
                    guidelines: data.reglas_creativas
                },
                product: {
                    name: data.tipo_producto,
                    description: data.descripcion_producto,
                    benefits: [data.beneficio_1, data.beneficio_2, data.beneficio_3].filter(Boolean),
                    price: data.precio_producto,
                    currency: data.moneda
                },
                avatar: {
                    type: data.tipo_creador,
                    age: data.rango_edad,
                    gender: data.genero_avatar,
                    energy: data.energia_avatar,
                    appearance: data.apariencia_fisica
                }
            });
        }
    }

    // Utility methods
    generateId() {
        return 'ugc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Settings management
    updateSettings(settings) {
        this.setState({
            settings: { ...this.state.settings, ...settings }
        });
    }

    // Data export/import
    exportData() {
        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            data: {
                projects: this.state.projects,
                ugcHistory: this.state.ugcHistory,
                settings: this.state.settings,
                onboardingData: this.state.onboardingData
            }
        };
    }

    importData(exportedData) {
        try {
            if (exportedData.version === '1.0' && exportedData.data) {
                this.setState({
                    projects: exportedData.data.projects || [],
                    ugcHistory: exportedData.data.ugcHistory || [],
                    settings: { ...this.state.settings, ...exportedData.data.settings },
                    onboardingData: exportedData.data.onboardingData || null
                });
                return true;
            }
        } catch (error) {
            console.error('Error importing data:', error);
        }
        return false;
    }

    // Analytics and stats
    getStats() {
        return {
            totalProjects: this.state.projects.length,
            totalUGC: this.state.ugcHistory.length,
            aiUsage: this.state.aiModels,
            activeProject: this.state.currentProject?.name || 'Ninguno',
            memberSince: this.state.user?.createdAt || new Date().toISOString(),
            planType: this.state.currentPlan || 'free'
        };
    }
}

// Global instance
window.AppState = new AppState();

// Utility functions for components
window.useAppState = (selector) => {
    const state = window.AppState.getState();
    return selector ? selector(state) : state;
};

window.updateAppState = (updates) => {
    window.AppState.setState(updates);
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppState;
}


