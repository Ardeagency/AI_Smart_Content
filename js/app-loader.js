/**
 * App Loader - Sistema centralizado de carga de la aplicación
 * Maneja: Supabase, Loading Screen, y sincronización de dependencias
 */
(function() {
    'use strict';
    
    // ===== CONFIGURACIÓN =====
    const CONFIG = {
        supabaseTimeout: 10000,      // Timeout para carga de Supabase (10s)
        retryAttempts: 3,            // Intentos de reconexión
        retryDelay: 1000             // Delay entre intentos (ms)
    };
    
    // ===== ESTADO GLOBAL =====
    const state = {
        supabaseReady: false,
        callbacks: [],
        errors: []
    };
    
    // ===== SUPABASE LOADER =====
    
    /**
     * Carga la configuración de Supabase desde Netlify Functions
     */
    async function loadSupabaseConfig(attempt = 1) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.supabaseTimeout);
            
            const response = await fetch('/.netlify/functions/supabase-config', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const config = await response.json();
            
            if (!config.url || !config.anonKey) {
                throw new Error('Configuración incompleta');
            }
            
            // Limpiar y validar URL
            let cleanUrl = config.url.trim().replace(/\/$/, '');
            if (!cleanUrl.includes('.supabase.co') && !cleanUrl.includes('supabase')) {
                throw new Error('URL de Supabase inválida');
            }
            
            // Verificar que la librería supabase esté disponible
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                throw new Error('Librería Supabase no disponible');
            }
            
            // Crear cliente de Supabase
            window.SUPABASE_URL = cleanUrl;
            window.SUPABASE_ANON_KEY = config.anonKey;
            window.supabase = supabase.createClient(cleanUrl, config.anonKey);
            
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
                await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
                return loadSupabaseConfig(attempt + 1);
            }
            
            // Si falló después de todos los intentos
            window.SUPABASE_CONFIG_READY = false;
            state.supabaseReady = false;
            
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

    // ===== SPINNER GLOBAL ÚNICO =====
    let spinnerRefCount = 0;

    function showSpinner() {
        const el = document.getElementById('globalSpinner');
        if (!el) return;
        spinnerRefCount++;
        el.classList.remove('loader-overlay--hidden');
    }

    function hideSpinner() {
        const el = document.getElementById('globalSpinner');
        if (!el) return;
        if (spinnerRefCount > 0) spinnerRefCount--;
        if (spinnerRefCount <= 0) {
            spinnerRefCount = 0;
            el.classList.add('loader-overlay--hidden');
        }
    }
    
    // ===== ENTRANCE SEQUENCE (timeline explícita, referencia Ashley) =====
    function runEntranceSequence() {
        const overlay = document.getElementById('entranceOverlay');
        if (!overlay) return;

        var lines1 = overlay.querySelectorAll('.entrance-text-1 .entrance-h3');
        var revealBox = overlay.querySelector('.entrance-reveal-box');
        var domainLine = overlay.querySelector('.entrance-text-2 .entrance-h3');

        function at(ms, fn) {
            if (ms <= 0) fn();
            else setTimeout(fn, ms);
        }

        // 1) Líneas entran con stagger (0, 0.35s, 0.7s)
        at(0, function () { if (lines1[0]) lines1[0].classList.add('entrance-visible'); });
        at(350, function () { if (lines1[1]) lines1[1].classList.add('entrance-visible'); });
        at(700, function () { if (lines1[2]) lines1[2].classList.add('entrance-visible'); });

        // 2) Líneas salen
        at(1100, function () {
            lines1.forEach(function (el) { el.classList.add('entrance-out'); });
        });

        // 3) Reveal box: mostrar → expandir → barrer a la derecha
        at(1400, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-show');
        });
        at(1550, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-expand');
        });
        at(2000, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-away');
        });

        // 4) Texto dominio visible
        at(2250, function () {
            if (domainLine) domainLine.classList.add('entrance-visible');
        });

        // 5) Salida dominio y fade del overlay
        at(2850, function () {
            if (domainLine) domainLine.classList.add('entrance-out');
            overlay.classList.add('entrance-overlay--hidden');
        });

        // 6) Al terminar: mostrar spinner solo si la landing no ha renderizado
        at(3400, function () {
            var container = document.getElementById('app-container');
            var hasContent = container && container.innerHTML.trim().length > 0;
            if (!hasContent && window.appLoader && typeof window.appLoader.showSpinner === 'function') {
                window.appLoader.showSpinner();
            }
        });
    }

    function startEntranceAndInit() {
        runEntranceSequence();
        loadSupabaseConfig();
    }

    // ===== INICIALIZACIÓN =====
    
    /**
     * Inicializa el app loader (Supabase). La secuencia de entrada se ejecuta en paralelo.
     */
    async function init() {
        await loadSupabaseConfig();
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

        // Spinner global único (ref-count: varias llamadas a showSpinner requieren otras tantas a hideSpinner)
        showSpinner: showSpinner,
        hideSpinner: hideSpinner,
        
        // Re-inicializar (útil para retry manual)
        reload: () => loadSupabaseConfig(1)
    };
    
    // También exponer getSupabaseClient globalmente para compatibilidad
    window.getSupabaseClient = getSupabaseClient;
    
    // Iniciar entrada en cuanto este script corre (el overlay ya está en el DOM arriba).
    // Así no esperamos a DOMContentLoaded ni a los demás scripts → se elimina el lag.
    requestAnimationFrame(function () {
        startEntranceAndInit();
    });
})();

