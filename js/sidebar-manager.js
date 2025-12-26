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
        // Snapshot inmutable - NUNCA es null, siempre tiene valores por defecto
        this.userData = this.getDefaultUserSnapshot();
        this.projectData = this.getDefaultProjectSnapshot();
        this.syncInterval = null;
        this.STORAGE_KEY = 'sidebar_snapshot';
        this.SYNC_INTERVAL = 30000; // 30 segundos
    }

    /**
     * Crear snapshot por defecto del usuario (inmutable)
     * El sidebar JAMÁS ve un estado "sin usuario"
     */
    getDefaultUserSnapshot() {
        return {
            id: null,
            email: '',
            full_name: '',
            plan_type: 'basico',
            credits_available: 0,
            credits_total: 0
        };
    }

    /**
     * Crear snapshot por defecto del proyecto (inmutable)
     */
    getDefaultProjectSnapshot() {
        return {
            id: null,
            nombre_marca: 'Cargando marca...',
            logo_url: null,
            sitio_web: null,
            instagram_url: null,
            tiktok_url: null,
            facebook_url: null
        };
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
     * REGLA DE ORO: Siempre hay un snapshot, nunca null
     */
    hydrateFromSnapshot() {
        try {
            const snapshot = localStorage.getItem(this.STORAGE_KEY);
            if (snapshot) {
                const data = JSON.parse(snapshot);
                // Fusionar snapshot guardado con defaults (nunca perder estructura)
                this.userData = { ...this.getDefaultUserSnapshot(), ...(data.userData || {}) };
                this.projectData = { ...this.getDefaultProjectSnapshot(), ...(data.projectData || {}) };
                console.log('💾 Sidebar hidratado desde snapshot local');
            } else {
                console.log('📝 No hay snapshot local, usando valores por defecto');
                // Ya están inicializados con defaults en constructor
            }
            // SIEMPRE actualizar UI inmediatamente (nunca esperar)
            this.updateUI();
        } catch (error) {
            console.error('❌ Error hidratando sidebar:', error);
            // En caso de error, mantener defaults y actualizar UI
            this.updateUI();
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

            // Actualizar estado (fusionar con defaults, nunca reemplazar completamente)
            if (userDataResult.status === 'fulfilled' && userDataResult.value) {
                this.userData = { ...this.getDefaultUserSnapshot(), ...userDataResult.value };
            }
            if (projectDataResult.status === 'fulfilled' && projectDataResult.value) {
                this.projectData = { ...this.getDefaultProjectSnapshot(), ...projectDataResult.value };
            }

            // Guardar snapshot para próxima vez (siempre hay datos, nunca null)
            this.saveSnapshot();

            // Actualizar UI (nunca hay estado "loading", siempre hay datos)
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
     * REGLA DE ORO: Siempre guardamos datos válidos, nunca null
     */
    saveSnapshot() {
        try {
            // Solo guardar si tenemos datos reales (no solo defaults)
            if (this.userData.id || this.projectData.id) {
                const snapshot = {
                    userData: this.userData,
                    projectData: this.projectData,
                    timestamp: Date.now()
                };
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(snapshot));
            }
        } catch (error) {
            console.error('Error guardando snapshot:', error);
        }
    }

    /**
     * Actualizar UI del sidebar
     * REGLA DE ORO: Esta función SIEMPRE renderiza, nunca espera datos
     * userData y projectData NUNCA son null, siempre tienen valores (aunque sean defaults)
     */
    updateUI() {
        // Elementos del DOM
        const navBrandLogo = document.getElementById('navBrandLogo');
        const navBrandInitials = document.getElementById('navBrandInitials');
        const navBrandName = document.getElementById('navBrandName');
        const navPlanName = document.getElementById('navPlanName');
        const navUserAvatar = document.getElementById('navUserAvatar');
        const creditsCount = document.getElementById('creditsCount');

        // SIEMPRE hay projectData (nunca null)
        // Logo de marca
        if (navBrandLogo && this.projectData.logo_url) {
            navBrandLogo.src = this.projectData.logo_url + '?t=' + Date.now();
            navBrandLogo.style.display = 'block';
            if (navBrandInitials) {
                navBrandInitials.style.display = 'none';
            }
        } else if (navBrandInitials) {
            // Siempre mostrar iniciales (aunque sea "C" de "Cargando marca...")
            const initials = this.getInitials(this.projectData.nombre_marca || 'M');
            navBrandInitials.textContent = initials;
            navBrandInitials.style.display = 'block';
            if (navBrandLogo) {
                navBrandLogo.style.display = 'none';
            }
        }

        // Nombre de marca (siempre hay valor, nunca undefined)
        if (navBrandName) {
            navBrandName.textContent = this.projectData.nombre_marca || 'Cargando marca...';
        }

        // SIEMPRE hay userData (nunca null)
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

        // Créditos en el sidebar (siempre hay valor numérico)
        if (creditsCount) {
            creditsCount.textContent = this.userData.credits_available || 0;
        }

        // Créditos en el header (formato: total/restantes) - siempre hay valores
        const headerCreditsValue = document.getElementById('headerCreditsValue');
        if (headerCreditsValue) {
            const total = this.userData.credits_total || 0;
            const restantes = this.userData.credits_available || 0;
            headerCreditsValue.textContent = `${total}/${restantes}`;
        }

        // Avatar del usuario (si no hay logo de marca)
        if (navUserAvatar && !this.projectData.logo_url) {
            const initials = this.getInitials(this.userData.full_name || this.userData.email || 'M');
            const initialsSpan = navUserAvatar.querySelector('span');
            if (initialsSpan) {
                initialsSpan.textContent = initials;
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

