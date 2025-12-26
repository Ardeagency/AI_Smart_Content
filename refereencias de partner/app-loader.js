/**
 * App Loader - Sistema centralizado de carga de la aplicación
 * Maneja: Supabase, Loading Screen, y sincronización de dependencias
 */
(function() {
    'use strict';
    
    // ===== CONFIGURACIÓN =====
    const CONFIG = {
        supabaseTimeout: 10000,      // Timeout para carga de Supabase (10s)
        minLoadingTime: 300,         // Tiempo mínimo de loading (ms)
        retryAttempts: 3,            // Intentos de reconexión
        retryDelay: 1000             // Delay entre intentos (ms)
    };
    
    // ===== ESTADO GLOBAL =====
    const state = {
        supabaseReady: false,
        loadingVisible: true,
        loadStartTime: Date.now(),
        callbacks: [],
        errors: []
    };
    
    // ===== LOADING SCREEN =====
    
    /**
     * Crea el HTML del loading screen si no existe
     */
    function createLoadingScreen() {
        // Si ya existe, no crear otro
        if (document.getElementById('appLoadingScreen')) return;
        
        const loadingHTML = `
            <div id="appLoadingScreen" class="app-loading-screen">
                <div class="app-loading-content">
                    <div class="app-loading-spinner"></div>
                    <div class="app-loading-text">Cargando...</div>
                </div>
            </div>
        `;
        
        // Insertar al inicio del body
        document.body.insertAdjacentHTML('afterbegin', loadingHTML);
    }
    
    /**
     * Inyecta los estilos del loading screen
     */
    function injectLoadingStyles() {
        if (document.getElementById('appLoadingStyles')) return;
        
        const styles = `
            .app-loading-screen {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #ffffff;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            }
            
            .app-loading-screen.hidden {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }
            
            .app-loading-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
            }
            
            .app-loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #e2e8f0;
                border-top-color: #003366;
                border-radius: 50%;
                animation: appLoaderSpin 0.8s linear infinite;
            }
            
            .app-loading-text {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 0.875rem;
                color: #64748b;
                font-weight: 500;
            }
            
            @keyframes appLoaderSpin {
                to { transform: rotate(360deg); }
            }
            
            /* Estilos para loading inline en contenedores */
            .inline-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 40px 20px;
                color: #64748b;
                font-size: 0.875rem;
            }
            
            .inline-loading i {
                animation: appLoaderSpin 1s linear infinite;
            }
            
            /* Loading para sidebar */
            .sidebar-loading {
                padding: 20px;
                text-align: center;
                color: rgba(255, 255, 255, 0.6);
                font-size: 0.813rem;
            }
            
            .sidebar-loading i {
                animation: appLoaderSpin 1s linear infinite;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'appLoadingStyles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }
    
    /**
     * Muestra el loading screen
     */
    function showLoading(message = 'Cargando...') {
        const screen = document.getElementById('appLoadingScreen');
        if (screen) {
            screen.classList.remove('hidden');
            const textEl = screen.querySelector('.app-loading-text');
            if (textEl) textEl.textContent = message;
        }
        state.loadingVisible = true;
    }
    
    /**
     * Oculta el loading screen con animación
     */
    function hideLoading() {
        const screen = document.getElementById('appLoadingScreen');
        if (!screen) return;
        
        // Asegurar tiempo mínimo de loading para evitar flash
        const elapsed = Date.now() - state.loadStartTime;
        const remaining = Math.max(0, CONFIG.minLoadingTime - elapsed);
        
        setTimeout(() => {
            screen.classList.add('hidden');
            state.loadingVisible = false;
            
            // Remover del DOM después de la animación
            setTimeout(() => {
                if (screen.parentNode) {
                    screen.parentNode.removeChild(screen);
                }
            }, 300);
        }, remaining);
    }
    
    /**
     * Actualiza el mensaje del loading
     */
    function updateLoadingMessage(message) {
        const textEl = document.querySelector('.app-loading-text');
        if (textEl) textEl.textContent = message;
    }
    
    // ===== SUPABASE LOADER =====
    
    /**
     * Carga la configuración de Supabase desde Netlify Functions
     */
    async function loadSupabaseConfig(attempt = 1) {
        try {
            updateLoadingMessage('Conectando...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.supabaseTimeout);
            
            const response = await fetch('/.netlify/functions/env', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const config = await response.json();
            
            if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
                throw new Error('Configuración incompleta');
            }
            
            // Limpiar y validar URL
            let cleanUrl = config.SUPABASE_URL.trim().replace(/\/$/, '');
            if (!cleanUrl.includes('.supabase.co') && !cleanUrl.includes('supabase')) {
                throw new Error('URL de Supabase inválida');
            }
            
            // Verificar que la librería supabase esté disponible
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                throw new Error('Librería Supabase no disponible');
            }
            
            // Crear cliente de Supabase
            window.SUPABASE_URL = cleanUrl;
            window.SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
            window.supabase = supabase.createClient(cleanUrl, config.SUPABASE_ANON_KEY);
            
            // Verificar que el cliente funcione
            if (!window.supabase || !window.supabase.from || !window.supabase.rpc) {
                throw new Error('Cliente Supabase inválido');
            }
            
            // Marcar como listo
            window.SUPABASE_CONFIG_READY = true;
            state.supabaseReady = true;
            
            // Disparar evento
            window.dispatchEvent(new CustomEvent('supabaseConfigReady'));
            
            // Ejecutar callbacks pendientes
            executeCallbacks();
            
            return true;
            
        } catch (error) {
            console.error(`Error cargando Supabase (intento ${attempt}):`, error.message);
            state.errors.push(error.message);
            
            // Reintentar si no hemos agotado los intentos
            if (attempt < CONFIG.retryAttempts) {
                updateLoadingMessage(`Reconectando... (${attempt}/${CONFIG.retryAttempts})`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
                return loadSupabaseConfig(attempt + 1);
            }
            
            // Si falló después de todos los intentos
            window.SUPABASE_CONFIG_READY = false;
            state.supabaseReady = false;
            
            // Aún así ocultar loading y dejar que la app maneje el error
            updateLoadingMessage('Error de conexión');
            
            return false;
        }
    }
    
    // ===== UTILIDADES DE ESPERA =====
    
    /**
     * Registra un callback para cuando Supabase esté listo
     */
    function onSupabaseReady(callback) {
        if (state.supabaseReady && window.supabase) {
            // Ya está listo, ejecutar inmediatamente
            callback(window.supabase);
        } else {
            // Agregar a la cola
            state.callbacks.push(callback);
        }
    }
    
    /**
     * Ejecuta todos los callbacks pendientes
     */
    function executeCallbacks() {
        while (state.callbacks.length > 0) {
            const callback = state.callbacks.shift();
            try {
                callback(window.supabase);
            } catch (error) {
                console.error('Error en callback de Supabase:', error);
            }
        }
    }
    
    /**
     * Promesa que resuelve cuando Supabase está listo
     */
    function waitForSupabase(timeout = CONFIG.supabaseTimeout) {
        return new Promise((resolve, reject) => {
            if (state.supabaseReady && window.supabase) {
                resolve(window.supabase);
                return;
            }
            
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout esperando Supabase'));
            }, timeout);
            
            onSupabaseReady((client) => {
                clearTimeout(timeoutId);
                resolve(client);
            });
        });
    }
    
    /**
     * Obtiene el cliente de Supabase de forma segura
     */
    function getSupabaseClient() {
        if (window.supabase && window.supabase.from) {
            return window.supabase;
        }
        return null;
    }
    
    // ===== HELPERS DE LOADING INLINE =====
    
    /**
     * Muestra loading inline en un contenedor
     */
    function showInlineLoading(containerId, message = 'Cargando...') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="inline-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>
        `;
    }
    
    /**
     * Muestra loading para el sidebar (historial de chat)
     */
    function showSidebarLoading(containerId, message = 'Cargando...') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="sidebar-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>
        `;
    }
    
    // ===== INICIALIZACIÓN =====
    
    /**
     * Inicializa el app loader
     */
    async function init() {
        // Inyectar estilos primero
        injectLoadingStyles();
        
        // Crear loading screen si estamos en una página que lo necesita
        // (no en index.html que tiene su propio loading)
        const isLandingPage = window.location.pathname === '/' || 
                             window.location.pathname === '/index.html';
        
        if (!isLandingPage) {
            createLoadingScreen();
        }
        
        // Cargar Supabase
        await loadSupabaseConfig();
        
        // Ocultar loading cuando todo esté listo
        if (!isLandingPage) {
            hideLoading();
        }
    }
    
    // ===== API PÚBLICA =====
    window.appLoader = {
        // Estado
        isReady: () => state.supabaseReady,
        getErrors: () => [...state.errors],
        
        // Supabase
        getClient: getSupabaseClient,
        onReady: onSupabaseReady,
        waitFor: waitForSupabase,
        
        // Loading
        showLoading: showLoading,
        hideLoading: hideLoading,
        updateMessage: updateLoadingMessage,
        showInlineLoading: showInlineLoading,
        showSidebarLoading: showSidebarLoading,
        
        // Re-inicializar (útil para retry manual)
        reload: () => loadSupabaseConfig(1)
    };
    
    // También exponer getSupabaseClient globalmente para compatibilidad
    window.getSupabaseClient = getSupabaseClient;
    
    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

