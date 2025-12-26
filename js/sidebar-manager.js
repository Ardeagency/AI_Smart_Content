/**
 * Sidebar Manager - Sistema Persistente
 * 
 * El sidebar NO es una vista dinámica. Es un proceso persistente con estado propio.
 * 
 * Regla de oro: El sidebar nunca se desmonta. Nunca.
 * 
 * Arquitectura:
 * - App inicia → sidebar se monta una vez
 * - Se hidrata con snapshot local (localStorage)
 * - Se sincroniza en background
 * - Cuando navegas → solo cambia el contenido principal
 * - El sidebar sigue vivo, no vuelve a pedir datos, no parpadea, no recarga
 */

class SidebarManager {
    constructor() {
        this.isInitialized = false;
        this.userData = null;
        this.projectData = null;
        this.syncInterval = null;
        this.STORAGE_KEY = 'sidebar_snapshot';
        this.SYNC_INTERVAL = 30000; // 30 segundos
    }

    /**
     * Inicializar el sidebar una sola vez
     * Se llama cuando la app inicia, no en cada navegación
     */
    async init() {
        if (this.isInitialized) {
            console.log('✅ Sidebar ya está inicializado, usando estado persistente');
            return;
        }

        console.log('🚀 Inicializando Sidebar Manager (una sola vez)');
        
        // 1. Hidratar con snapshot local (instantáneo, sin esperar API)
        this.hydrateFromSnapshot();
        
        // 2. Cargar datos frescos en background (sin bloquear UI)
        this.syncInBackground();
        
        // 3. Configurar sincronización periódica
        this.startPeriodicSync();
        
        // 4. Marcar como inicializado
        this.isInitialized = true;
        
        // 5. Actualizar UI con datos disponibles
        this.updateUI();
    }

    /**
     * Hidratar sidebar con snapshot local (instantáneo)
     * Esto evita el "flash" o parpadeo al cargar
     */
    hydrateFromSnapshot() {
        try {
            const snapshot = localStorage.getItem(this.STORAGE_KEY);
            if (snapshot) {
                const data = JSON.parse(snapshot);
                this.userData = data.userData || null;
                this.projectData = data.projectData || null;
                console.log('💾 Sidebar hidratado desde snapshot local');
                this.updateUI();
            } else {
                console.log('📝 No hay snapshot local, sidebar se inicializará vacío');
            }
        } catch (error) {
            console.error('❌ Error hidratando sidebar:', error);
        }
    }

    /**
     * Sincronizar datos en background (sin bloquear UI)
     * Esto se ejecuta después de la hidratación
     */
    async syncInBackground() {
        try {
            // Esperar a que Supabase esté disponible
            const supabase = await this.waitForSupabase();
            if (!supabase) {
                console.warn('⚠️ Supabase no disponible, usando snapshot local');
                return;
            }

            // Obtener usuario autenticado
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                console.warn('⚠️ Usuario no autenticado');
                return;
            }

            // Cargar datos del usuario y proyecto en paralelo
            const [userDataResult, projectDataResult] = await Promise.allSettled([
                this.loadUserData(supabase, user.id),
                this.loadProjectData(supabase, user.id)
            ]);

            // Actualizar estado
            if (userDataResult.status === 'fulfilled' && userDataResult.value) {
                this.userData = userDataResult.value;
            }
            if (projectDataResult.status === 'fulfilled' && projectDataResult.value) {
                this.projectData = projectDataResult.value;
            }

            // Guardar snapshot para próxima vez
            this.saveSnapshot();

            // Actualizar UI
            this.updateUI();

            console.log('✅ Sidebar sincronizado en background');
        } catch (error) {
            console.error('❌ Error sincronizando sidebar:', error);
        }
    }

    /**
     * Cargar datos del usuario
     */
    async loadUserData(supabase, userId) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error cargando datos de usuario:', error);
            return null;
        }
    }

    /**
     * Cargar datos del proyecto
     */
    async loadProjectData(supabase, userId) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error cargando datos de proyecto:', error);
            return null;
        }
    }

    /**
     * Guardar snapshot local para hidratación rápida
     */
    saveSnapshot() {
        try {
            const snapshot = {
                userData: this.userData,
                projectData: this.projectData,
                timestamp: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(snapshot));
        } catch (error) {
            console.error('Error guardando snapshot:', error);
        }
    }

    /**
     * Actualizar UI del sidebar
     * Esta función solo actualiza el DOM, no recarga datos
     */
    updateUI() {
        // Actualizar logo de marca
        const navBrandLogo = document.getElementById('navBrandLogo');
        const navBrandInitials = document.getElementById('navBrandInitials');
        const navBrandName = document.getElementById('navBrandName');
        const navPlanName = document.getElementById('navPlanName');
        const navUserAvatar = document.getElementById('navUserAvatar');
        const creditsCount = document.getElementById('creditsCount');

        if (this.projectData) {
            // Logo de marca
            if (navBrandLogo && this.projectData.logo_url) {
                navBrandLogo.src = this.projectData.logo_url + '?t=' + Date.now();
                navBrandLogo.style.display = 'block';
                if (navBrandInitials) {
                    navBrandInitials.style.display = 'none';
                }
            } else if (navBrandInitials && this.projectData.nombre_marca) {
                const initials = this.getInitials(this.projectData.nombre_marca);
                navBrandInitials.textContent = initials;
                navBrandInitials.style.display = 'block';
                if (navBrandLogo) {
                    navBrandLogo.style.display = 'none';
                }
            }

            // Nombre de marca
            if (navBrandName) {
                navBrandName.textContent = this.projectData.nombre_marca || 'Sin marca';
            }
        }

        if (this.userData) {
            // Plan del usuario
            if (navPlanName) {
                const planNames = {
                    'basico': 'Plan Básico',
                    'starter': 'Plan Starter',
                    'pro': 'Plan Pro',
                    'enterprise': 'Plan Enterprise'
                };
                navPlanName.textContent = planNames[this.userData.plan_type] || 'Plan Básico';
            }

            // Créditos en el sidebar
            if (creditsCount) {
                creditsCount.textContent = this.userData.credits_available || 0;
            }

            // Créditos en el header (formato: total/restantes)
            const headerCreditsValue = document.getElementById('headerCreditsValue');
            if (headerCreditsValue) {
                const total = this.userData.credits_total || 0;
                const restantes = this.userData.credits_available || 0;
                headerCreditsValue.textContent = `${total}/${restantes}`;
            }

            // Avatar del usuario (si no hay logo de marca)
            if (navUserAvatar && !this.projectData?.logo_url) {
                const initials = this.getInitials(this.userData.full_name || this.userData.email);
                const initialsSpan = navUserAvatar.querySelector('span');
                if (initialsSpan) {
                    initialsSpan.textContent = initials;
                }
            }
        }
    }

    /**
     * Obtener iniciales de un nombre
     */
    getInitials(name) {
        if (!name) return 'M';
        return name.split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Iniciar sincronización periódica
     */
    startPeriodicSync() {
        // Limpiar intervalo anterior si existe
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        // Sincronizar cada X segundos
        this.syncInterval = setInterval(() => {
            this.syncInBackground();
        }, this.SYNC_INTERVAL);
    }

    /**
     * Detener sincronización periódica
     */
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Esperar a que Supabase esté disponible
     */
    async waitForSupabase() {
        if (typeof waitForSupabase === 'function') {
            return await waitForSupabase();
        }
        return null;
    }

    /**
     * Obtener datos actuales (para uso externo)
     */
    getData() {
        return {
            userData: this.userData,
            projectData: this.projectData
        };
    }

    /**
     * Forzar sincronización manual
     */
    async forceSync() {
        console.log('🔄 Forzando sincronización del sidebar');
        await this.syncInBackground();
    }
}

// Instancia global única (singleton)
let sidebarManagerInstance = null;

/**
 * Obtener o crear instancia del SidebarManager
 * Esto asegura que solo haya una instancia en toda la app
 */
function getSidebarManager() {
    if (!sidebarManagerInstance) {
        sidebarManagerInstance = new SidebarManager();
    }
    return sidebarManagerInstance;
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const manager = getSidebarManager();
        manager.init();
    });
} else {
    // DOM ya está listo
    const manager = getSidebarManager();
    manager.init();
}

// Exportar para uso global
window.SidebarManager = SidebarManager;
window.getSidebarManager = getSidebarManager;

