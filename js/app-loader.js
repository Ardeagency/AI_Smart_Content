/**
 * App Loader - Sistema centralizado de carga de la aplicación
 * Maneja: Supabase, Loading Screen, y sincronización de dependencias
 */
(function() {
    'use strict';

    // ===== CONSOLE: silenciar logs en producción =====
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        const noop = () => {};
        const _error = console.error.bind(console);
        console.log = noop;
        console.debug = noop;
        console.info = noop;
        console.warn = noop;
        console.error = _error;
    }

    // ===== CONFIGURACIÓN =====
    const CONFIG = {
        supabaseTimeout: 25000,      // Timeout para carga de Supabase (25s; red/functions lentas)
        retryAttempts: 3,            // Intentos de reconexión
        retryDelay: 2000             // Delay entre intentos (ms)
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

            // Inicializar Facebook JS SDK si está disponible el App ID
            if (config.metaAppId) {
                window.META_APP_ID = config.metaAppId;
                window.META_API_VERSION = config.metaApiVersion || 'v19.0';
                initFacebookSDK(config.metaAppId, config.metaApiVersion || 'v19.0');
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
            
            // Si falló después de todos los intentos: avisar a quien esté esperando (sin esperar 25s)
            window.SUPABASE_CONFIG_READY = false;
            state.supabaseReady = false;
            window.supabase = null;
            console.warn('Supabase no disponible. Comprueba /.netlify/functions/supabase-config y las variables de entorno.');
            executeCallbacks(null);
            
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
     * Ejecuta todos los callbacks pendientes (client = null si la carga falló)
     */
    function executeCallbacks(client) {
        const value = client !== undefined ? client : window.supabase;
        while (state.callbacks.length > 0) {
            const callback = state.callbacks.shift();
            try {
                callback(value);
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

    // ===== FACEBOOK JS SDK =====

    /**
     * Carga e inicializa el Facebook JS SDK con el App ID obtenido del servidor.
     * Se invoca solo si META_APP_ID está disponible en la configuración.
     *
     * Uso desde otras vistas:
     *   - window.META_APP_ID  → App ID de la app de Facebook
     *   - window.META_API_VERSION → versión de la Graph API (ej. 'v19.0')
     *   - Escuchar window.addEventListener('fbSDKReady', ...) para saber cuándo FB está listo
     */
    function initFacebookSDK(appId, version) {
        window.fbAsyncInit = function () {
            FB.init({
                appId:   appId,
                cookie:  true,
                xfbml:   true,
                version: version
            });

            // Page view inicial
            FB.AppEvents.logPageView();

            // Page views en cada navegación SPA: el router dispara 'routechange'
            window.addEventListener('routechange', function () {
                if (window.FB && window.FB.AppEvents) {
                    FB.AppEvents.logPageView();
                }
            });

            window.dispatchEvent(new CustomEvent('fbSDKReady'));
        };

        (function (d, s, id) {
            var js, fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) { return; }
            js = d.createElement(s);
            js.id = id;
            js.src = 'https://connect.facebook.net/en_US/sdk.js';
            fjs.parentNode.insertBefore(js, fjs);
        }(document, 'script', 'facebook-jssdk'));
    }

    // ===== SPINNER GLOBAL ÚNICO =====
    let spinnerRefCount = 0;

    function showSpinner() {
        const el = document.getElementById('globalSpinner');
        if (!el) return;
        spinnerRefCount++;
        el.classList.remove('loader-overlay--hidden', 'loader-overlay--gone');
    }

    function hideSpinner() {
        const el = document.getElementById('globalSpinner');
        if (!el) return;
        if (spinnerRefCount > 0) spinnerRefCount--;
        if (spinnerRefCount <= 0) {
            spinnerRefCount = 0;
            el.classList.add('loader-overlay--hidden');
            var duration = 900;
            el.addEventListener('transitionend', function onEnd(e) {
                if (e.target !== el || e.propertyName !== 'opacity') return;
                el.removeEventListener('transitionend', onEnd);
                el.classList.add('loader-overlay--gone');
            }, { once: true });
            setTimeout(function () {
                el.classList.add('loader-overlay--gone');
            }, duration + 50);
        }
    }
    
    // ===== ENTRANCE SEQUENCE: solo caja (blanco) + dominio =====
    // La landing se oculta con body.entrance-active hasta que termina esta animación.
    function runEntranceSequence() {
        const overlay = document.getElementById('entranceOverlay');
        if (!overlay) return;

        var revealBox = overlay.querySelector('.entrance-reveal-box');
        var entranceLogo = overlay.querySelector('.entrance-logo');

        function at(ms, fn) {
            if (ms <= 0) fn();
            else setTimeout(fn, ms);
        }

        // 1) Rectángulo con degradado: mostrar → expandir → barrer a la derecha
        at(0, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-show');
        });
        at(280, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-expand');
        });
        at(1100, function () {
            if (revealBox) revealBox.classList.add('entrance-reveal-away');
        });

        // 2) Logo visible
        at(1400, function () {
            if (entranceLogo) entranceLogo.classList.add('entrance-visible');
        });

        // 3) Salida logo, fade del overlay y revelar landing (#app-container)
        at(2400, function () {
            if (entranceLogo) entranceLogo.classList.add('entrance-out');
            overlay.classList.add('entrance-overlay--hidden');
            document.body.classList.remove('entrance-active');
            document.body.classList.add('entrance-done');
        });

        // 4) Al terminar: mostrar spinner solo si la landing aún no ha renderizado
        at(3200, function () {
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

