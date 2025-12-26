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
                .from('user_profiles')
                .select('id, email, phone_number, role, is_active, email_verified')
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

    // Función para mostrar notificación de usuario no aprobado
    function showUserNotApprovedNotification() {
        const notification = document.getElementById('userNotApprovedNotification');
        if (notification) {
            notification.classList.add('active');
        }
    }

    // Función para mostrar mensaje de aprobación pendiente
    function showPendingApproval() {
        const landingContent = document.querySelector('.landing-content');
        const pendingApproval = document.getElementById('pendingApproval');
        
        if (landingContent) {
            landingContent.classList.add('hide-buttons');
        }
        
        if (pendingApproval) {
            pendingApproval.classList.add('active');
        }
    }

    // Función para verificar si el usuario está pendiente o si debe redirigir a la app
    async function checkPendingUser() {
        const session = getUserSession();
        if (!session) return;

        const userStatus = await checkUserStatus(session.userId);
        if (!userStatus) {
            // Si no se puede verificar, limpiar sesión
            clearUserSession();
            return;
        }

        // Si el usuario tiene permisos (role diferente de 'user'), redirigir al dashboard
        if (userStatus.role !== 'user' && userStatus.is_active) {
            window.location.href = '/dashboard.html';
            return;
        }

        // Si el usuario está pendiente (role 'user'), mostrar mensaje
        if (userStatus.role === 'user') {
            showPendingApproval();
        }
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

        // Elementos del registro
        const registerBtn = document.getElementById('registerBtn');
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
        const closeUserNotification = document.getElementById('closeUserNotification');
        const emailNotVerifiedNotification = document.getElementById('emailNotVerifiedNotification');
        const userNotApprovedNotification = document.getElementById('userNotApprovedNotification');

        if (closeEmailNotification && emailNotVerifiedNotification) {
            closeEmailNotification.addEventListener('click', function() {
                emailNotVerifiedNotification.classList.remove('active');
            });
        }

        if (closeUserNotification && userNotApprovedNotification) {
            closeUserNotification.addEventListener('click', function() {
                userNotApprovedNotification.classList.remove('active');
            });
        }

        // Validar que existan los elementos
        if (!loginBtn || !loginModal || !closeLoginModal || !loginForm) {
            console.error('Elementos del login no encontrados');
        }

        if (!registerBtn || !registerModal || !closeRegisterModal || !registerForm) {
            console.error('Elementos del registro no encontrados');
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
                const rememberMe = document.getElementById('rememberMe').checked;
                
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

                    // Obtener perfil del usuario desde user_profiles
                    let profileData = null;
                    const { data: fetchedProfile, error: profileError } = await supabase
                        .from('user_profiles')
                        .select('id, full_name, email, phone_number, role, email_verified, is_active')
                        .eq('id', authData.user.id)
                        .single();

                    if (profileError) {
                        console.error('Error obteniendo perfil:', profileError);
                        
                        // Si el error es porque la tabla no existe o falta la columna
                        if (profileError.code === 'PGRST204' || profileError.code === '42P01') {
                            alert('⚠️ La tabla user_profiles no está configurada correctamente en Supabase.\n\nPor favor ejecuta el SQL de SETUP_INSTRUCCIONES.md en Supabase SQL Editor.');
                            await supabase.auth.signOut();
                            return;
                        }
                        
                        // Si el perfil no existe, intentar crearlo
                        if (profileError.code === 'PGRST116') {
                            console.log('Perfil no existe, intentando crear...');
                            const { data: newProfile, error: createError } = await supabase
                                .from('user_profiles')
                                .insert({
                                    id: authData.user.id,
                                    full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0],
                                    email: authData.user.email || email.toLowerCase().trim(),
                                    phone_number: authData.user.phone || null,
                                    role: 'user',
                                    email_verified: authData.user.email_confirmed_at ? true : false,
                                    is_active: true
                                })
                                .select()
                                .single();
                            
                            if (!createError && newProfile) {
                                profileData = newProfile;
                            } else {
                                console.error('Error creando perfil:', createError);
                                alert('⚠️ No se pudo crear el perfil. Verifica que la tabla user_profiles exista en Supabase.');
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

                    // Verificar si el usuario está activo
                    if (!profileData.is_active) {
                        alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
                        await supabase.auth.signOut();
                        return;
                    }

                    // Guardar sesión
                    const userData = {
                        id: profileData.id,
                        userId: profileData.id,
                        email: profileData.email,
                        full_name: profileData.full_name,
                        role: profileData.role,
                        email_verified: profileData.email_verified
                    };
                    saveUserSession(userData, rememberMe);

                    // Verificar si el email está verificado
                    const emailNotVerified = !profileData.email_verified && !authData.user.email_confirmed_at;
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
                    window.location.href = '/dashboard.html';
                } catch (error) {
                    console.error('Error en login:', error);
                    alert('Error al iniciar sesión: ' + (error.message || 'Error desconocido'));
                }
            });
        }

        // ========== REGISTRO ==========
        // Mostrar modal de registro
        if (registerBtn) {
            registerBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (registerModal) registerModal.classList.add('active');
            });
        }

        // Cerrar modal de registro
        if (closeRegisterModal) {
            closeRegisterModal.addEventListener('click', function() {
                if (registerModal) registerModal.classList.remove('active');
            });
        }

        // Cerrar modal de registro al hacer clic fuera
        if (registerModal) {
            registerModal.addEventListener('click', function(e) {
                if (e.target === registerModal) {
                    registerModal.classList.remove('active');
                }
            });
        }

        // Manejar envío del formulario de registro
        if (registerForm) {
            registerForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const full_name = document.getElementById('full_name').value;
                const email = document.getElementById('register_email').value;
                const phone_number = document.getElementById('phone_number').value;
                const password = document.getElementById('register_password').value;
                
                // Validación básica
                if (!full_name || !email || !password) {
                    alert('Por favor completa los campos requeridos');
                    return;
                }

                if (password.length < 6) {
                    alert('La contraseña debe tener al menos 6 caracteres');
                    return;
                }
                
                const supabase = getSupabaseClient();
                if (!supabase) {
                    alert('Error: No se puede conectar con el servidor');
                    return;
                }
                
                try {
                    // Crear usuario (enviará email de verificación)
                    const { data: authData, error: authError } = await supabase.auth.signUp({
                        email: email.toLowerCase().trim(),
                        password: password,
                        options: {
                            data: {
                                full_name: full_name.trim()
                            }
                        }
                    });

                    if (authError) {
                        if (authError.message.includes('already registered') || authError.code === '23505') {
                            alert('Este email ya está registrado');
                        } else {
                            alert(authError.message || 'Error al registrarse');
                        }
                        return;
                    }

                    if (!authData.user) {
                        alert('Error al crear la cuenta');
                        return;
                    }

                    // Intentar obtener el perfil (puede que ya exista por el trigger)
                    let profileData = null;
                    let attempts = 0;
                    const maxAttempts = 3;
                    
                    while (attempts < maxAttempts && !profileData) {
                        const { data: existingProfile, error: fetchError } = await supabase
                            .from('user_profiles')
                            .select('*')
                            .eq('id', authData.user.id)
                            .single();
                        
                        if (!fetchError && existingProfile) {
                            profileData = existingProfile;
                            break;
                        }
                        
                        // Si no existe, intentar crear (solo en el primer intento)
                        if (attempts === 0) {
                            const email_verification_token = Math.random().toString(36).substring(2, 15) + 
                                                              Math.random().toString(36).substring(2, 15);
                            
                            const { data: newProfile, error: insertError } = await supabase
                                .from('user_profiles')
                                .insert({
                                    id: authData.user.id,
                                    full_name: full_name.trim(),
                                    email: email.toLowerCase().trim(),
                                    phone_number: phone_number ? phone_number.trim() : null,
                                    role: 'user',
                                    email_verification_token: email_verification_token,
                                    email_verified: false,
                                    is_active: true
                                })
                                .select()
                                .single();
                            
                            if (!insertError && newProfile) {
                                profileData = newProfile;
                                break;
                            } else if (insertError && insertError.code === '23505') {
                                // Si hay conflicto de clave única, esperar un momento y reintentar
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else {
                                console.error('Error creando perfil:', insertError);
                            }
                        }
                        
                        attempts++;
                        if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                    
                    // Si después de los intentos no hay perfil, usar datos básicos
                    if (!profileData) {
                        console.warn('⚠️ No se pudo crear/obtener perfil, usando datos básicos del usuario');
                        profileData = {
                            id: authData.user.id,
                            full_name: full_name.trim(),
                            email: email.toLowerCase().trim(),
                            role: 'user',
                            email_verified: false,
                            is_active: true
                        };
                    }

                    // Guardar datos del usuario recién registrado
                    const userData = {
                        id: profileData.id,
                        userId: profileData.id,
                        email: profileData.email,
                        full_name: profileData.full_name,
                        role: profileData.role,
                        email_verified: profileData.email_verified
                    };
                    saveUserSession(userData, false);
                    
                    // Cerrar modal
                    if (registerModal) registerModal.classList.remove('active');
                    
                    // Mostrar mensaje de aprobación pendiente (siempre para usuarios nuevos con role 'user')
                    showPendingApproval();
                    
                    alert('Tu cuenta ha sido creada y está pendiente de aprobación por un administrador. Recibirás una notificación por correo (o serás contactado) cuando tu acceso sea concedido.');
                } catch (error) {
                    console.error('Error en registro:', error);
                    alert('Error al registrarse: ' + (error.message || 'Error desconocido'));
                }
            });
        }

        // Cerrar modales con ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (loginModal && loginModal.classList.contains('active')) {
                    loginModal.classList.remove('active');
                }
                if (registerModal && registerModal.classList.contains('active')) {
                    registerModal.classList.remove('active');
                }
            }
        });

        // Ocultar loading screen
        hideLoadingScreen();
    });

    // Función para ocultar el loading screen
    function hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
            }, 500);
        }
    }
})();
