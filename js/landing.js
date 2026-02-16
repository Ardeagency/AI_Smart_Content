// Landing page JavaScript
(function() {
    'use strict';

    function getSupabaseClient() {
        if (typeof supabase !== 'undefined' && supabase) {
            return supabase;
        }
        
        const SUPABASE_URL = window.SUPABASE_URL;
        const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
        
        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        
        console.error('Cliente no está disponible');
        return null;
    }

    // Usar sessionManager si está disponible, sino usar funciones locales
    function getUserSession() {
        if (typeof window.sessionManager !== 'undefined') {
            return window.sessionManager.getSession();
        }
        // Fallback local
        const sessionData = localStorage.getItem('user_session');
        if (sessionData) {
            try {
                return JSON.parse(sessionData);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function saveUserSession(userData, rememberMe) {
        if (typeof window.sessionManager !== 'undefined') {
            window.sessionManager.saveSession(userData, rememberMe);
            return;
        }
        // Fallback local
        const session = {
            userId: userData.id || userData.userId,
            email: userData.email,
            full_name: userData.full_name,
            role: userData.role,
            email_verified: userData.email_verified
        };
        
        if (rememberMe) {
            localStorage.setItem('user_session', JSON.stringify(session));
        } else {
            sessionStorage.setItem('user_session', JSON.stringify(session));
        }
    }

    function clearUserSession() {
        if (typeof window.sessionManager !== 'undefined') {
            window.sessionManager.clearSession();
            return;
        }
        // Fallback local
        localStorage.removeItem('user_session');
        sessionStorage.removeItem('user_session');
    }

    async function checkUserStatus(userId) {
        const supabase = getSupabaseClient();
        if (!supabase) return null;
        
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, email')
                .eq('id', userId)
                .single();
            
            if (error || !data) {
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error al verificar estado:', error);
            return null;
        }
    }

    // Función para mostrar notificación de email no verificado
    function showEmailNotVerifiedNotification() {
        const notification = document.getElementById('emailNotVerifiedNotification');
        if (notification) {
            notification.classList.add('active');
        }
    }

    // Función para verificar si el usuario debe redirigir a la app
    async function checkPendingUser() {
        const session = getUserSession();
        if (!session) return;

        const userStatus = await checkUserStatus(session.userId);
        if (!userStatus) {
            // Si no se puede verificar, limpiar sesión
            clearUserSession();
            return;
        }

        // Si el usuario está autenticado, redirigir al dashboard
        window.location.href = '/products.html';
    }

    // Esperar a que el DOM esté listo
    document.addEventListener('DOMContentLoaded', function() {
        // Verificar si hay un usuario pendiente
        checkPendingUser();

        // Elementos del login
        const loginBtn = document.getElementById('loginBtn');
        const loginModal = document.getElementById('loginModal');
        const closeLoginModal = document.getElementById('closeLoginModal');
        const loginForm = document.getElementById('loginForm');

        // Elementos del registro (ya no se usan, el botón redirige a planes.html)
        const registerModal = document.getElementById('registerModal');
        const closeRegisterModal = document.getElementById('closeRegisterModal');
        const registerForm = document.getElementById('registerForm');

        // Botones para mostrar/ocultar contraseñas
        const toggleLoginPassword = document.getElementById('toggleLoginPassword');
        const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
        const loginPasswordInput = document.getElementById('password');
        const registerPasswordInput = document.getElementById('register_password');

        // Toggle para contraseña de login
        if (toggleLoginPassword && loginPasswordInput) {
            toggleLoginPassword.addEventListener('click', function() {
                const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                loginPasswordInput.setAttribute('type', type);
                
                const icon = toggleLoginPassword.querySelector('i');
                if (icon) {
                    if (type === 'text') {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                        toggleLoginPassword.setAttribute('aria-label', 'Ocultar contraseña');
                    } else {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                        toggleLoginPassword.setAttribute('aria-label', 'Mostrar contraseña');
                    }
                }
            });
        }

        // Toggle para contraseña de registro
        if (toggleRegisterPassword && registerPasswordInput) {
            toggleRegisterPassword.addEventListener('click', function() {
                const type = registerPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                registerPasswordInput.setAttribute('type', type);
                
                const icon = toggleRegisterPassword.querySelector('i');
                if (icon) {
                    if (type === 'text') {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                        toggleRegisterPassword.setAttribute('aria-label', 'Ocultar contraseña');
                    } else {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                        toggleRegisterPassword.setAttribute('aria-label', 'Mostrar contraseña');
                    }
                }
            });
        }

        // Cerrar notificaciones
        const closeEmailNotification = document.getElementById('closeEmailNotification');
        const emailNotVerifiedNotification = document.getElementById('emailNotVerifiedNotification');

        if (closeEmailNotification && emailNotVerifiedNotification) {
            closeEmailNotification.addEventListener('click', function() {
                emailNotVerifiedNotification.classList.remove('active');
            });
        }

        // Validar que existan los elementos
        if (!loginBtn || !loginModal || !closeLoginModal || !loginForm) {
            console.error('Elementos del login no encontrados');
        }

        // ========== LOGIN ==========
        // Mostrar modal de login
        if (loginBtn) {
            loginBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (loginModal) loginModal.classList.add('active');
            });
        }

        // Cerrar modal de login
        if (closeLoginModal) {
            closeLoginModal.addEventListener('click', function() {
                if (loginModal) loginModal.classList.remove('active');
            });
        }

        // Cerrar modal de login al hacer clic fuera
        if (loginModal) {
            loginModal.addEventListener('click', function(e) {
                if (e.target === loginModal) {
                    loginModal.classList.remove('active');
                }
            });
        }

        // Manejar envío del formulario de login
        if (loginForm) {
            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const email = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const rememberMe = false; // Siempre usar sessionStorage
                
                // Validación básica
                if (!email || !password) {
                    alert('Por favor completa todos los campos');
                    return;
                }
                
                const supabase = getSupabaseClient();
                if (!supabase) {
                    alert('Error: No se puede conectar con el servidor');
                    return;
                }
                
                try {
                    // Iniciar sesión
                    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                        email: email.toLowerCase().trim(),
                        password: password
                    });

                    if (authError) {
                        alert(authError.message || 'Error al iniciar sesión');
                        return;
                    }

                    if (!authData.user) {
                        alert('Error al iniciar sesión');
                        return;
                    }

                    // Obtener perfil del usuario desde tabla unificada profiles
                    let profileData = null;
                    const { data: fetchedProfile, error: profileError } = await supabase
                        .from('profiles')
                        .select('id, full_name, email, role')
                        .eq('id', authData.user.id)
                        .single();

                    if (profileError) {
                        console.error('Error obteniendo perfil:', profileError);
                        
                        if (profileError.code === 'PGRST204' || profileError.code === '42P01') {
                            alert('⚠️ La tabla profiles no está configurada correctamente en Supabase.\n\nPor favor ejecuta el SQL de SETUP_INSTRUCCIONES.md en Supabase SQL Editor.');
                            await supabase.auth.signOut();
                            return;
                        }
                        
                        if (profileError.code === 'PGRST116') {
                            console.log('Perfil no existe, intentando crear...');
                            const { data: newProfile, error: createError } = await supabase
                                .from('profiles')
                                .insert({
                                    id: authData.user.id,
                                    full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0],
                                    email: authData.user.email || email.toLowerCase().trim()
                                })
                                .select()
                                .single();
                            
                            if (!createError && newProfile) {
                                profileData = newProfile;
                            } else {
                                console.error('Error creando perfil:', createError);
                                alert('⚠️ No se pudo crear el perfil. Verifica que la tabla profiles exista en Supabase.');
                                await supabase.auth.signOut();
                                return;
                            }
                        } else {
                            alert('Error al obtener datos del usuario: ' + (profileError.message || 'Error desconocido'));
                            await supabase.auth.signOut();
                            return;
                        }
                    } else {
                        profileData = fetchedProfile;
                    }

                    if (!profileData) {
                        alert('Error: No se pudo obtener o crear el perfil del usuario');
                        await supabase.auth.signOut();
                        return;
                    }

                    // Guardar sesión
                    const userData = {
                        id: profileData.id,
                        userId: profileData.id,
                        email: profileData.email,
                        full_name: profileData.full_name,
                        email_verified: !!authData.user.email_confirmed_at
                    };
                    saveUserSession(userData, rememberMe);

                    // Verificar si el email está verificado (desde auth)
                    const emailNotVerified = !authData.user.email_confirmed_at;
                    if (emailNotVerified) {
                        showEmailNotVerifiedNotification();
                        if (loginModal) loginModal.classList.remove('active');
                        await supabase.auth.signOut();
                        return;
                    }

                    // Verificar si el usuario tiene permisos (role diferente de 'user')
                    if (profileData.role === 'user') {
                        showUserNotApprovedNotification();
                        if (loginModal) loginModal.classList.remove('active');
                        await supabase.auth.signOut();
                        return;
                    }

                    // Si pasa todas las validaciones, redirigir al dashboard
                    window.location.href = '/products.html';
                } catch (error) {
                    console.error('Error en login:', error);
                    alert('Error al iniciar sesión: ' + (error.message || 'Error desconocido'));
                }
            });
        }

        // ========== REGISTRO ==========
        // El registro ahora se maneja en planes.html, no aquí

        // Cerrar modales con ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (loginModal && loginModal.classList.contains('active')) {
                    loginModal.classList.remove('active');
                }
            }
        });
    });
})();

