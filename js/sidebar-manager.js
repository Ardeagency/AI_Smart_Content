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
        this.isSyncing = false; // Protección contra llamadas simultáneas
    }

    /**
     * Crear snapshot por defecto del usuario (inmutable)
     * El sidebar JAMÁS ve un estado "sin usuario"
     * UserShellState: siempre presente, nunca null, nunca loading
     */
    getDefaultUserSnapshot() {
        return {
            id: null,
            email: '',
            full_name: '',
            plan_type: 'basico',
            plan_name: 'Plan Básico', // Siempre visible, nunca "—"
            credits_available: 0,
            credits_total: 0,
            avatar_initial: 'M' // Avatar placeholder persistente
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
            logo_initial: 'M', // Inicial placeholder persistente
            sitio_web: null,
            instagram_url: null,
            tiktok_url: null,
            facebook_url: null
        };
    }

    /**
     * Inicializar el sidebar una sola vez
     * Se llama cuando la app inicia, no en cada navegación
     * 
     * REGLA DE ORO: Renderizar PRIMERO, luego sincronizar en background
     */
    async init() {
        if (this.isInitialized) {
            console.log('✅ Sidebar ya está inicializado, usando estado persistente');
            // Aún así, asegurar que el UI esté actualizado
            this.updateUI();
            return;
        }

        console.log('🚀 Inicializando Sidebar Manager (una sola vez)');
        
        // 1. Hidratar con snapshot local (instantáneo, sin esperar API)
        this.hydrateFromSnapshot();
        
        // 2. Renderizar UI INMEDIATAMENTE con snapshot (antes de cualquier async)
        // Usar requestAnimationFrame para asegurar que el DOM esté listo
        requestAnimationFrame(() => {
            this.updateUI();
        });
        
        // 3. Marcar como inicializado (antes de async)
        this.isInitialized = true;
        
        // 4. Cargar datos frescos en background (sin bloquear UI)
        // Esto actualizará el UI suavemente cuando lleguen los datos
        this.syncInBackground();
        
        // 5. Configurar sincronización periódica
        this.startPeriodicSync();
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
                // Asegurar que tengan valores calculados
                this.userData.avatar_initial = this.getInitials(this.userData.full_name || this.userData.email || 'M');
                this.userData.plan_name = 'Plan Básico';
                this.projectData.logo_initial = this.getInitials(this.projectData.nombre_marca || 'M');
            }
            // NO actualizar UI aquí - se hace en init() con requestAnimationFrame
        } catch (error) {
            console.error('❌ Error hidratando sidebar:', error);
            // En caso de error, mantener defaults y actualizar UI
            this.updateUI();
        }
    }

    /**
     * Sincronizar datos en background (sin bloquear UI)
     * Esto se ejecuta después de la hidratación
     * PROTECCIÓN: Evita llamadas simultáneas múltiples
     */
    async syncInBackground() {
        // Si ya hay una sincronización en curso, ignorar esta llamada
        if (this.isSyncing) {
            console.log('⏳ Sincronización ya en curso, ignorando llamada duplicada');
            return;
        }

        this.isSyncing = true;
        
        try {
            // Esperar a que Supabase esté disponible
            const supabase = await this.waitForSupabase();
            if (!supabase) {
                console.warn('⚠️ Supabase no disponible, usando snapshot local');
                this.isSyncing = false;
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
            let hasChanges = false;
            
            if (userDataResult.status === 'fulfilled' && userDataResult.value) {
                const newUserData = { ...this.getDefaultUserSnapshot(), ...userDataResult.value };
                // Calcular plan_name si no viene
                if (!newUserData.plan_name) {
                    const planNames = {
                        'basico': 'Plan Básico',
                        'starter': 'Plan Starter',
                        'pro': 'Plan Pro',
                        'enterprise': 'Plan Enterprise'
                    };
                    newUserData.plan_name = planNames[newUserData.plan_type] || 'Plan Básico';
                }
                // Calcular avatar_initial si no viene
                if (!newUserData.avatar_initial) {
                    newUserData.avatar_initial = this.getInitials(newUserData.full_name || newUserData.email || 'M');
                }
                this.userData = newUserData;
                hasChanges = true;
            }
            
            if (projectDataResult.status === 'fulfilled' && projectDataResult.value) {
                const newProjectData = { ...this.getDefaultProjectSnapshot(), ...projectDataResult.value };
                // Calcular logo_initial si no hay logo_url
                if (!newProjectData.logo_url && !newProjectData.logo_initial) {
                    newProjectData.logo_initial = this.getInitials(newProjectData.nombre_marca || 'M');
                }
                this.projectData = newProjectData;
                hasChanges = true;
            }

            // Solo actualizar si hay cambios reales (evitar re-renders innecesarios)
            if (hasChanges) {
                // Guardar snapshot para próxima vez (siempre hay datos, nunca null)
                this.saveSnapshot();

                // Actualizar UI suavemente (nunca hay estado "loading", siempre hay datos)
                // Usar requestAnimationFrame para actualización suave
                requestAnimationFrame(() => {
                    this.updateUI();
                });
            }

            console.log('✅ Sidebar sincronizado en background');
        } catch (error) {
            console.error('❌ Error sincronizando sidebar:', error);
        } finally {
            // Siempre liberar el flag, incluso si hay error
            this.isSyncing = false;
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
                .from('brand_containers')
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
     * 
     * NOTA: El header del sidebar ahora solo muestra "AI SMART CONTENT" (estático)
     * Solo actualizamos los créditos del header principal y el nombre del perfil
     */
    updateUI() {
        // ============================================
        // CRÉDITOS EN EL HEADER: Siempre visible
        // ============================================
        // Créditos en el header principal (formato: total/restantes) - siempre hay valores
        // Los créditos ya no se muestran en el header
        // Viven en "Administrar organización"

        // ============================================
        // AVATAR EN EL HEADER: Siempre visible
        // ============================================
        const avatarInitials = document.getElementById('avatarInitials');
        const avatarCircle = document.getElementById('avatarCircle');
        
        if (avatarInitials && this.userData.avatar_initial) {
            avatarInitials.textContent = this.userData.avatar_initial;
        }
        
        // Si hay avatar_url, usarlo
        if (avatarCircle && this.userData.avatar_url) {
            avatarCircle.style.backgroundImage = `url(${this.userData.avatar_url})`;
            avatarCircle.style.backgroundSize = 'cover';
            avatarCircle.style.backgroundPosition = 'center';
            if (avatarInitials) {
                avatarInitials.style.display = 'none';
            }
        } else if (avatarCircle && avatarInitials) {
            // Si no hay avatar_url, mostrar iniciales
            avatarCircle.style.backgroundImage = 'none';
            avatarInitials.style.display = 'flex';
        }

        // ============================================
        // NOMBRE DEL PERFIL EN EL FOOTER: Siempre visible
        // ============================================
        const navProfileName = document.getElementById('navProfileName');
        if (navProfileName) {
            // Mostrar nombre completo o email, siempre hay un valor
            const displayName = this.userData.full_name || 
                              this.userData.email || 
                              'Usuario';
            navProfileName.textContent = displayName;
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
            this.syncInterval = null;
        }

        // Sincronizar cada X segundos (solo si no hay una sincronización en curso)
        this.syncInterval = setInterval(() => {
            if (!this.isSyncing) {
                this.syncInBackground();
            } else {
                console.log('⏭️ Saltando sincronización periódica (ya hay una en curso)');
            }
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

// Inicializar INMEDIATAMENTE (no esperar DOMContentLoaded)
// Esto asegura que el snapshot se renderice antes de cualquier otra cosa
// PROTECCIÓN: Solo inicializar una vez
(function() {
    // Verificar si ya se inicializó
    if (window.__sidebarManagerInitialized) {
        return;
    }
    window.__sidebarManagerInitialized = true;
    
    const manager = getSidebarManager();
    
    // Renderizar UI inmediatamente con valores por defecto
    // Esto evita cualquier parpadeo inicial
    if (document.readyState === 'loading') {
        // Si el DOM aún no está listo, esperar pero renderizar tan pronto como sea posible
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(() => {
                manager.updateUI();
                manager.init();
            });
        });
    } else {
        // DOM ya está listo, renderizar inmediatamente
        requestAnimationFrame(() => {
            manager.updateUI();
            manager.init();
        });
    }
})();

// Exportar para uso global
window.SidebarManager = SidebarManager;
window.getSidebarManager = getSidebarManager;

