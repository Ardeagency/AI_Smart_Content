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

    // ===== SERVICE WORKER (solo producción) =====
    // Registramos /sw.js con scope raíz. Sólo en hosts no-localhost para
    // no interferir con hot reload en dev. El SW cachea assets versionados
    // (cache-first) y nunca toca HTML ni APIs (bypass).
    if ('serviceWorker' in navigator
        && location.hostname !== 'localhost'
        && location.hostname !== '127.0.0.1') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then((registration) => {
                // Detectar updates en background. Cuando Netlify deploya una
                // nueva versión, el browser baja el sw.js nuevo y queda en
                // "waiting"; en cuanto skipWaiting() (en sw.js) lo activa,
                // se dispara controllerchange. Avisamos al user para recargar
                // y ver la versión nueva — sin esto, el user queda en cache
                // del build anterior hasta que cierre todas las pestañas.
                //
                // Truco: si controller==null al registrar, es la PRIMERA
                // instalación (silenciar — no hay versión vieja que invalidar).
                // Si ya había controller, controllerchange = update real.
                const hadControllerAtStart = !!navigator.serviceWorker.controller;
                let notified = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (notified || !hadControllerAtStart) return;
                    notified = true;
                    if (window.showToast) {
                        window.showToast((window.__ ? window.__('Nueva versión disponible — recarga la página') : 'Nueva versión disponible — recarga la página'), {
                            duration: 0,
                            type: 'info',
                        });
                    }
                });
                // Buscar updates inmediatamente si la página estuvo abierta horas.
                if (registration && typeof registration.update === 'function') {
                    setTimeout(() => { try { registration.update(); } catch (_) {} }, 60 * 60 * 1000);
                }
            }).catch(() => {
                /* registro silencioso; offline-first es opt-in, no romper si falla */
            });
        });
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
    
    // ===== FADE-IN DE IMAGENES DE CONTENIDO AL CARGAR =====
    // Un solo listener global en captura (el evento `load` de <img> no burbujea).
    // Failsafe: solo AGREGA una animacion al cargar; nunca pone opacity:0 por
    // defecto, asi ninguna imagen puede quedar invisible. Catch async-inserted.
    // Scope: salta chrome del nav/header e iconos/avatares chicos (<120px) para
    // no "parpadear" la UI; solo imagenes de contenido (galerias, brand, productos).
    function _revealImg(e) {
        const img = e.target;
        if (!img || (img.tagName !== 'IMG' && img.tagName !== 'VIDEO') || img.dataset.faded) return;
        if (img.closest && img.closest('#navigation-container, .app-header, .main-header')) return;
        // En load saltamos chrome/iconos chicos; en error revelamos SIEMPRE (no dejar invisible).
        if (e.type === 'load' && img.tagName === 'IMG' && (img.naturalWidth || 0) < 120) return;
        img.dataset.faded = '1';
        img.classList.add('is-loaded');
    }
    document.addEventListener('load', _revealImg, true);
    document.addEventListener('error', _revealImg, true);

    // ===== BARRA DE PROGRESO DE NAVEGACION (no-bloqueante) =====
    // El router la dispara en cambios de ruta en vez del spinner full-screen.
    // Min-display 400ms: si la navegacion termina antes de que la barra alcance
    // ese tiempo visible, la sostenemos hasta cumplirlo para que no parpadee
    // (un flash <300ms se percibe como glitch — NN/g).
    let progressShownAt = 0;
    let progressHideTimer = null;
    const PROGRESS_MIN_MS = 400;

    function showProgress() {
        const el = document.getElementById('routeProgress');
        if (!el) return;
        if (progressHideTimer) { clearTimeout(progressHideTimer); progressHideTimer = null; }
        if (!el.classList.contains('route-progress--active')) {
            progressShownAt = Date.now();
            el.classList.add('route-progress--active');
        }
    }

    function hideProgress() {
        const el = document.getElementById('routeProgress');
        if (!el) return;
        const elapsed = Date.now() - progressShownAt;
        const remaining = Math.max(0, PROGRESS_MIN_MS - elapsed);
        if (progressHideTimer) clearTimeout(progressHideTimer);
        progressHideTimer = setTimeout(() => {
            el.classList.remove('route-progress--active');
            progressHideTimer = null;
        }, remaining);
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

        // Barra de progreso de navegacion (no-bloqueante; la usa el router en cambios de ruta)
        showProgress: showProgress,
        hideProgress: hideProgress,
        
        // Re-inicializar (útil para retry manual)
        reload: () => loadSupabaseConfig(1)
    };
    
    // También exponer getSupabaseClient globalmente para compatibilidad
    window.getSupabaseClient = getSupabaseClient;
    
    // Cargar configuración de Supabase en cuanto este script corre: sin animación de entrada.
    loadSupabaseConfig();
})();

